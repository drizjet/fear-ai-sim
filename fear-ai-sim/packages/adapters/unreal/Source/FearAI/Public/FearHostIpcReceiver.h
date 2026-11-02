#pragma once
#include "CoreMinimal.h"
#include "Dom/JsonObject.h"

// UE5.5+ source-only opt-in receiving side of FEAR-IPC-1. The host must bind
// this instance to an explicitly owned and authenticated transport connection.
// The existing FearAgentComponent middleware WebSocket is unrelated and
// MUST NOT forward its untrusted JSON directly through this metadata API.
// Unreal Editor/PIE compilation and behavior remain NOT PROVEN here.
class FEARAI_API FFearHostIpcReceiver
{
public:
    bool Configure(const FString& SessionId, const FString& SecretHex,
        const TSet<FString>& AllowedEvents, const TSet<FString>& AllowedEntities);
    void Close();
    bool Receive(const FString& SignedPacket, int64 CurrentTick,
        TSharedPtr<FJsonObject>& OutMetadata, FString& OutReason);
    int64 LastSequence() const {return Sequence;}

    int32 MaxMessagesPerWindow = 32;
    int32 MaxFrameBytes = 262144;
    int32 MaxWindowBytes = 1048576;
    double WindowSeconds = 1.0;
private:
    FString Session;
    TArray<uint8> Secret;
    TSet<FString> Events;
    TSet<FString> Entities;
    int64 Sequence=0;
    int32 Attempts=0, Admitted=0, AdmittedBytes=0;
    double WindowStart=0.0;
    bool bClosed=true;
};
