#include "FearHostIpcReceiver.h"
#include "IPlatformCrypto.h"
#include "EncryptionContextOpenSSL.h"
#include "Misc/Base64.h"
#include "Misc/DateTime.h"
#include "Misc/ScopeLock.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "Containers/StringConv.h"
#include "HAL/PlatformTime.h"

namespace {
bool LowerHex(const FString& Hex, int32 Length) {
    if (Hex.Len()!=Length) return false;
    for (TCHAR Ch:Hex) if (!((Ch>=TEXT('0')&&Ch<=TEXT('9'))
        ||(Ch>=TEXT('a')&&Ch<=TEXT('f')))) return false;
    return true;
}
int32 Nibble(TCHAR Ch){
    if (Ch>=TEXT('0')&&Ch<=TEXT('9'))return Ch-TEXT('0');
    if (Ch>=TEXT('a')&&Ch<=TEXT('f'))return Ch-TEXT('a')+10;
    return -1;
}
bool HexBytes(const FString& Text,TArray<uint8>& Out){
    if (Text.Len()%2) return false;
    Out.Reset(Text.Len()/2);
    for(int32 i=0;i<Text.Len();i+=2){
        int32 A=Nibble(Text[i]),B=Nibble(Text[i+1]);
        if(A<0||B<0)return false;
        Out.Add(static_cast<uint8>((A<<4)|B));
    }
    return true;
}
bool Sha256(const TArray<uint8>& Bytes,TArray<uint8>& Digest) {
    if (!IPlatformCrypto::IsAvailable()) return false;
    auto Context=IPlatformCrypto::Get().CreateContext();
    if(!Context)return false;
    return Context->CalcSHA256(MakeArrayView(Bytes), Digest) && Digest.Num()==32;
}
bool HmacSha256(const TArray<uint8>& Key,const FString& Signed,TArray<uint8>& Out) {
    if(Key.Num()!=32)return false;
    TArray<uint8> Ipad,Opad;
    Ipad.Init(0x36,64);Opad.Init(0x5c,64);
    for(int32 i=0;i<32;++i){Ipad[i]^=Key[i];Opad[i]^=Key[i];}
    FTCHARToUTF8 Utf(*Signed);
    for(int32 i=0;i<Utf.Length();++i)Ipad.Add(static_cast<uint8>(Utf.Get()[i]));
    TArray<uint8> Inner;
    if(!Sha256(Ipad,Inner))return false;
    Opad.Append(Inner);
    return Sha256(Opad,Out);
}
bool SafeJson(const TSharedPtr<FJsonValue>& Root) {
    TArray<TPair<TSharedPtr<FJsonValue>,int32>> Work;
    Work.Emplace(Root,0);
    int32 Nodes=0;
    while(!Work.IsEmpty()){
        auto Item=Work.Pop(EAllowShrinking::No);
        if(++Nodes>4096||Item.Value>32||!Item.Key.IsValid())return false;
        if(Item.Key->Type==EJson::Object){
            const auto& Map=Item.Key->AsObject()->Values;
            if(Map.Num()>256)return false;
            for(const auto& Pair:Map){
                if(Pair.Key.Len()>16384||Pair.Key==TEXT("__proto__")||
                    Pair.Key==TEXT("prototype")||Pair.Key==TEXT("constructor")||
                    Pair.Key==TEXT("toJSON"))return false;
                Work.Emplace(Pair.Value,Item.Value+1);
            }
        }else if(Item.Key->Type==EJson::Array){
            const auto& Values=Item.Key->AsArray();
            if(Values.Num()>2048)return false;
            for(const auto& Child:Values)Work.Emplace(Child,Item.Value+1);
        }else if(Item.Key->Type==EJson::String){
            if(Item.Key->AsString().Len()>16384)return false;
        }else if(Item.Key->Type==EJson::Number){
            if(!FMath::IsFinite(Item.Key->AsNumber()))return false;
        }
    }
    return true;
}
bool Fields(const TSharedPtr<FJsonObject>& Object,std::initializer_list<const TCHAR*> Expected){
    if(!Object.IsValid()||Object->Values.Num()!=static_cast<int32>(Expected.size()))return false;
    for(const auto& Pair:Object->Values){
        bool Found=false;
        for(const TCHAR* Key:Expected)if(Pair.Key==Key){Found=true;break;}
        if(!Found)return false;
    }
    return true;
}
}

bool FFearHostIpcReceiver::Configure(const FString& SessionId,const FString& SecretHex,
    const TSet<FString>& AllowedEvents,const TSet<FString>& AllowedEntities){
    Close();
    if(!LowerHex(SessionId,32)||!LowerHex(SecretHex,64)||
        AllowedEvents.Num()>256||AllowedEntities.Num()>256||
        MaxMessagesPerWindow<1||MaxMessagesPerWindow>1024||
        MaxFrameBytes<1||MaxFrameBytes>1048576||
        MaxWindowBytes<MaxFrameBytes||MaxWindowBytes>67108864||
        WindowSeconds<0.01||WindowSeconds>60.0)return false;
    if(!HexBytes(SecretHex,Secret)||Secret.Num()!=32)return false;
    Session=SessionId;Events=AllowedEvents;Entities=AllowedEntities;
    WindowStart=FPlatformTime::Seconds();Sequence=0;
    Attempts=Admitted=AdmittedBytes=0;bClosed=false;
    return true;
}
void FFearHostIpcReceiver::Close() {
    if(!Secret.IsEmpty())FMemory::Memzero(Secret.GetData(),Secret.Num());
    Secret.Empty();Session.Empty();Events.Empty();Entities.Empty();
    Attempts=Admitted=AdmittedBytes=0;Sequence=0;bClosed=true;
}
bool FFearHostIpcReceiver::Receive(const FString& SignedPacket,int64 CurrentTick,
    TSharedPtr<FJsonObject>& OutMetadata,FString& OutReason){
    OutMetadata.Reset();
    auto Reject=[&](const TCHAR* Reason){OutReason=Reason;return false;};
    if(bClosed)return Reject(TEXT("closed"));
    const double Now=FPlatformTime::Seconds();
    if(Now-WindowStart>=WindowSeconds){
        WindowStart=Now;Attempts=Admitted=AdmittedBytes=0;
    }
    if(++Attempts>MaxMessagesPerWindow*8+8)return Reject(TEXT("rate_limited"));
    if(SignedPacket.Len()>1400000)return Reject(TEXT("invalid_envelope"));
    int32 Dots=0;
    for(TCHAR Ch:SignedPacket)if(Ch==TEXT('.'))++Dots;
    if(Dots!=4)return Reject(TEXT("invalid_envelope"));
    for(TCHAR Ch:SignedPacket)if(Ch>127)return Reject(TEXT("invalid_envelope"));
    TArray<FString> Parts;SignedPacket.ParseIntoArray(Parts,TEXT("."),false);
    if(Parts.Num()!=5||Parts[0]!=TEXT("FEAR-IPC-1")||Parts[1]!=Session||
        Parts[2].IsEmpty()||Parts[2].Len()>16||Parts[2].StartsWith(TEXT("0"))||
        !Parts[2].IsNumeric()||!LowerHex(Parts[4],64))
        return Reject(TEXT("invalid_envelope"));
    const int64 Incoming=FCString::Atoi64(*Parts[2]);
    if(Incoming<1||Incoming>9007199254740991LL)return Reject(TEXT("invalid_envelope"));
    FString Signed=Parts[0]+TEXT(".")+Parts[1]+TEXT(".")+Parts[2]+TEXT(".")+Parts[3];
    TArray<uint8> Expected,Provided;
    if(!HexBytes(Parts[4],Provided)||!HmacSha256(Secret,Signed,Expected))
        return Reject(TEXT("authentication_unavailable"));
    if(Expected.Num()!=32||Provided.Num()!=32)return Reject(TEXT("invalid_envelope"));
    uint8 Diff=0;
    for(int32 i=0;i<32;++i)Diff|=Expected[i]^Provided[i];
    if(Diff!=0)return Reject(TEXT("unauthenticated"));
    if(Incoming!=Sequence+1)return Reject(TEXT("replay_or_sequence"));
    if(Admitted>=MaxMessagesPerWindow)return Reject(TEXT("rate_limited"));
    const FString& Encoded=Parts[3];
    if(Encoded.Len()%4==1){Sequence=Incoming;++Admitted;return Reject(TEXT("invalid_payload"));}
    for(TCHAR Ch:Encoded)if(!((Ch>=TEXT('0')&&Ch<=TEXT('9'))||
        (Ch>=TEXT('a')&&Ch<=TEXT('z'))||(Ch>=TEXT('A')&&Ch<=TEXT('Z'))||
        Ch==TEXT('-')||Ch==TEXT('_'))){
        Sequence=Incoming;++Admitted;return Reject(TEXT("invalid_payload"));
    }
    const int32 Size=Encoded.Len()*3/4;
    if(Size>MaxFrameBytes){Sequence=Incoming;++Admitted;return Reject(TEXT("frame_too_large"));}
    if(AdmittedBytes+Size>MaxWindowBytes)return Reject(TEXT("rate_limited"));
    Sequence=Incoming;++Admitted;AdmittedBytes+=Size;
    FString Standard=Encoded.Replace(TEXT("-"),TEXT("+")).Replace(TEXT("_"),TEXT("/"));
    while(Standard.Len()%4)Standard+=TEXT("=");
    TArray<uint8> Raw;
    if(!FBase64::Decode(Standard,Raw)||Raw.Num()!=Size)return Reject(TEXT("invalid_payload"));
    FUTF8ToTCHAR Utf(reinterpret_cast<const ANSICHAR*>(Raw.GetData()),Raw.Num());
    FString Json(Utf.Length(),Utf.Get());
    FTCHARToUTF8 Back(*Json);
    if(Back.Length()!=Raw.Num()||FMemory::Memcmp(Back.Get(),Raw.GetData(),Raw.Num())!=0)
        return Reject(TEXT("invalid_payload"));
    if(Json.Len()>262144)return Reject(TEXT("frame_too_large"));
    auto Reader=TJsonReaderFactory<>::Create(Json);
    TSharedPtr<FJsonObject> Parsed;
    if(!FJsonSerializer::Deserialize(Reader,Parsed)||!Parsed.IsValid()||
        !SafeJson(MakeShared<FJsonValueObject>(Parsed)))return Reject(TEXT("invalid_payload"));
    double Version=0;
    if(!Parsed->TryGetNumberField(TEXT("version"),Version)||Version!=1)
        return Reject(TEXT("invalid_payload"));
    FString Kind;
    if(!Parsed->TryGetStringField(TEXT("kind"),Kind))return Reject(TEXT("invalid_payload"));
    if(Kind==TEXT("event")&&Fields(Parsed,{TEXT("version"),TEXT("kind"),
        TEXT("type"),TEXT("tick"),TEXT("details")})){
        FString Type;double Tick;
        const TSharedPtr<FJsonObject>* Details=nullptr;
        if(!Parsed->TryGetStringField(TEXT("type"),Type)||Type.IsEmpty()||
            !Parsed->TryGetNumberField(TEXT("tick"),Tick)||
            Tick!=CurrentTick||!Parsed->TryGetObjectField(TEXT("details"),Details))
            return Reject(TEXT("invalid_payload"));
        if(!Events.Contains(Type))return Reject(TEXT("forbidden_event"));
    }else if(Kind==TEXT("cargo")&&Fields(Parsed,{TEXT("version"),TEXT("kind"),
        TEXT("entityId"),TEXT("cargo")})){
        FString Id;const TSharedPtr<FJsonObject>* Cargo=nullptr;
        if(!Parsed->TryGetStringField(TEXT("entityId"),Id)||Id.IsEmpty()||
            Id.Len()>256||!Parsed->TryGetObjectField(TEXT("cargo"),Cargo))
            return Reject(TEXT("invalid_payload"));
        if(Id.StartsWith(TEXT("trade:"))||!Entities.Contains(Id))
            return Reject(TEXT("forbidden_entity"));
    }else return Reject(TEXT("invalid_payload"));
    OutMetadata=Parsed;OutReason=TEXT("accepted");return true;
}
