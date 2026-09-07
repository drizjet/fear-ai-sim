// Fear AI Unreal Engine 5 Actor Component Implementation
#include "FearAgentComponent.h"
#include "WebSocketsModule.h"
#include "Json.h"
#include "JsonObjectConverter.h"

UFearAgentComponent::UFearAgentComponent()
{
    PrimaryComponentTick.bCanEverTick = true;
    PrimaryComponentTick.TickInterval = 0.05f; // 20Hz polling
}

void UFearAgentComponent::BeginPlay()
{
    Super::BeginPlay();

    if (AgentId.IsEmpty())
    {
        AgentId = FString::Printf(TEXT("unreal_agent_%d"), GetUniqueID());
    }

    ConnectWebSocket();
}

void UFearAgentComponent::EndPlay(const EEndPlayReason::Type EndPlayReason)
{
    if (WebSocket.IsValid() && WebSocket->IsConnected())
    {
        WebSocket->Close();
    }
    Super::EndPlay(EndPlayReason);
}

void UFearAgentComponent::ConnectWebSocket()
{
    if (!FModuleManager::Get().IsModuleLoaded("WebSockets"))
    {
        FModuleManager::Get().LoadModule("WebSockets");
    }

    const FString ServerUrl = TEXT("ws://127.0.0.1:8765");
    WebSocket = FWebSocketsModule::Get().CreateWebSocket(ServerUrl);

    WebSocket->OnConnected().AddLambda([this]()
    {
        UE_LOG(LogTemp, Log, TEXT("[FearAI] Unreal Connected to Fear AI Server"));

        // Register Agent
        TSharedPtr<FJsonObject> RegObj = MakeShareable(new FJsonObject());
        RegObj->SetStringField("type", "REGISTER_AGENT");
        RegObj->SetStringField("agent_id", AgentId);

        TSharedPtr<FJsonObject> TraitsObj = MakeShareable(new FJsonObject());
        TraitsObj->SetNumberField("neuroticism", Neuroticism);
        TraitsObj->SetNumberField("leadership", Leadership);
        RegObj->SetObjectField("traits", TraitsObj);

        FString OutStr;
        TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&OutStr);
        FJsonSerializer::Serialize(RegObj.ToSharedRef(), Writer);
        WebSocket->Send(OutStr);
    });

    WebSocket->OnMessage().AddLambda([this](const FString& Message)
    {
        ProcessStateJson(Message);
    });

    WebSocket->Connect();
}

void UFearAgentComponent::TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction)
{
    Super::TickComponent(DeltaTime, TickType, ThisTickFunction);

    if (!WebSocket.IsValid() || !WebSocket->IsConnected())
    {
        return;
    }

    AActor* Owner = GetOwner();
    if (!Owner) return;

    FVector Pos = Owner->GetActorLocation();

    // Dispatch sensory observations
    TSharedPtr<FJsonObject> ObsObj = MakeShareable(new FJsonObject());
    ObsObj->SetStringField("type", "BATCH_TICK_REQUEST");
    ObsObj->SetNumberField("dt", DeltaTime);

    TArray<TSharedPtr<FJsonValue>> ObsArray;
    TSharedPtr<FJsonObject> SingleObs = MakeShareable(new FJsonObject());
    SingleObs->SetStringField("agent_id", AgentId);
    SingleObs->SetNumberField("x", Pos.X / 100.0f); // Convert cm to m
    SingleObs->SetNumberField("y", Pos.Y / 100.0f);
    SingleObs->SetNumberField("z", Pos.Z / 100.0f);

    ObsArray.Add(MakeShareable(new FJsonValueObject(SingleObs)));
    ObsObj->SetArrayField("observations", ObsArray);

    FString OutJson;
    TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&OutJson);
    FJsonSerializer::Serialize(ObsObj.ToSharedRef(), Writer);
    WebSocket->Send(OutJson);
}

void UFearAgentComponent::ProcessStateJson(const FString& Message)
{
    TSharedPtr<FJsonObject> JsonObj;
    TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(Message);

    if (FJsonSerializer::Deserialize(Reader, JsonObj) && JsonObj.IsValid())
    {
        const TArray<TSharedPtr<FJsonValue>>* Results;
        if (JsonObj->TryGetArrayField("results", Results))
        {
            for (auto& ResultVal : *Results)
            {
                TSharedPtr<FJsonObject> AgentState = ResultVal->AsObject();
                if (AgentState.IsValid() && AgentState->GetStringField("agent_id") == AgentId)
                {
                    FString BandStr = AgentState->GetStringField("fear_band");
                    EFearBand NewBand = StringToFearBand(BandStr);

                    TSharedPtr<FJsonObject> Affective = AgentState->GetObjectField("affective_state");
                    CurrentRawFear = Affective.IsValid() ? Affective->GetNumberField("raw_fear") : 0.0f;

                    if (NewBand != CurrentFearBand)
                    {
                        CurrentFearBand = NewBand;
                        OnFearBandChanged.Broadcast(CurrentFearBand, CurrentRawFear);
                    }

                    // Parse Action Intent
                    TSharedPtr<FJsonObject> IntentObj = AgentState->GetObjectField("action_intent");
                    if (IntentObj.IsValid())
                    {
                        FFearActionIntent Intent;
                        Intent.Type = IntentObj->GetStringField("type");
                        Intent.Urgency = IntentObj->GetNumberField("urgency");
                        Intent.SuggestedPosture = IntentObj->GetStringField("suggested_posture");

                        TSharedPtr<FJsonObject> VecObj = IntentObj->GetObjectField("vector_hint");
                        if (VecObj.IsValid())
                        {
                            Intent.VectorHint = FVector(
                                VecObj->GetNumberField("x"),
                                VecObj->GetNumberField("y"),
                                VecObj->GetNumberField("z")
                            );
                        }
                        OnActionIntentReceived.Broadcast(Intent);
                    }

                    // Parse Audio Hints
                    TSharedPtr<FJsonObject> AudioObj = AgentState->GetObjectField("audio_hints");
                    if (AudioObj.IsValid())
                    {
                        FFearAudioHints Hints;
                        Hints.HeartbeatBpm = AudioObj->GetIntegerField("heartbeat_bpm");
                        Hints.ShepardMix = AudioObj->GetNumberField("shepard_mix");
                        Hints.LowpassCutoffHz = AudioObj->GetNumberField("lowpass_cutoff_hz");
                        Hints.InfrasoundIntensity = AudioObj->GetNumberField("infrasound_intensity");
                        Hints.VocalizationHint = AudioObj->GetStringField("vocalization_hint");
                        OnAudioHintsUpdated.Broadcast(Hints);
                    }
                }
            }
        }
    }
}

EFearBand UFearAgentComponent::StringToFearBand(const FString& BandStr) const
{
    if (BandStr == "PANIC") return EFearBand::Panic;
    if (BandStr == "ANXIOUS") return EFearBand::Anxious;
    if (BandStr == "ALERT") return EFearBand::Alert;
    if (BandStr == "PRESENCE_BREAK") return EFearBand::PresenceBreak;
    if (BandStr == "RECOVER") return EFearBand::Recover;
    if (BandStr == "AGGRESSIVE") return EFearBand::Aggressive;
    if (BandStr == "HIDE") return EFearBand::Hide;
    if (BandStr == "FREEZE") return EFearBand::Freeze;
    if (BandStr == "VAULTING") return EFearBand::Vaulting;
    if (BandStr == "CRAWLING") return EFearBand::Crawling;
    return EFearBand::Calm;
}
