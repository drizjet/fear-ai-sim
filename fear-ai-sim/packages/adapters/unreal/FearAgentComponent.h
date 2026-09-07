// Fear AI Unreal Engine 5 Actor Component
#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "IWebSocket.h"
#include "FearAgentComponent.generated.h"

UENUM(BlueprintType)
enum class EFearBand : uint8
{
    Calm UMETA(DisplayName = "Calm"),
    Alert UMETA(DisplayName = "Alert"),
    Anxious UMETA(DisplayName = "Anxious"),
    Panic UMETA(DisplayName = "Panic"),
    PresenceBreak UMETA(DisplayName = "Presence Break"),
    Recover UMETA(DisplayName = "Recover"),
    Aggressive UMETA(DisplayName = "Aggressive"),
    Hide UMETA(DisplayName = "Hide"),
    Freeze UMETA(DisplayName = "Freeze"),
    Vaulting UMETA(DisplayName = "Vaulting"),
    Crawling UMETA(DisplayName = "Crawling")
};

USTRUCT(BlueprintType)
struct FFearActionIntent
{
    GENERATED_BODY()

    UPROPERTY(BlueprintReadOnly, Category = "Fear AI")
    FString Type;

    UPROPERTY(BlueprintReadOnly, Category = "Fear AI")
    FString TargetId;

    UPROPERTY(BlueprintReadOnly, Category = "Fear AI")
    float Urgency;

    UPROPERTY(BlueprintReadOnly, Category = "Fear AI")
    FVector VectorHint;

    UPROPERTY(BlueprintReadOnly, Category = "Fear AI")
    FString SuggestedPosture;
};

USTRUCT(BlueprintType)
struct FFearAudioHints
{
    GENERATED_BODY()

    UPROPERTY(BlueprintReadOnly, Category = "Fear AI")
    int32 HeartbeatBpm;

    UPROPERTY(BlueprintReadOnly, Category = "Fear AI")
    float ShepardMix;

    UPROPERTY(BlueprintReadOnly, Category = "Fear AI")
    float LowpassCutoffHz;

    UPROPERTY(BlueprintReadOnly, Category = "Fear AI")
    float InfrasoundIntensity;

    UPROPERTY(BlueprintReadOnly, Category = "Fear AI")
    FString VocalizationHint;
};

DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnFearBandChanged, EFearBand, NewBand, float, RawFear);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnActionIntentReceived, const FFearActionIntent&, Intent);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnAudioHintsUpdated, const FFearAudioHints&, AudioHints);

UCLASS(ClassGroup=(FearAI), meta=(BlueprintSpawnableComponent))
class FEARAI_API UFearAgentComponent : public UActorComponent
{
    GENERATED_BODY()

public:
    UFearAgentComponent();

    virtual void BeginPlay() override;
    virtual void EndPlay(const EEndPlayReason::Type EndPlayReason) override;
    virtual void TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction) override;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Fear AI|Identity")
    FString AgentId;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Fear AI|Personality")
    float Neuroticism = 0.5f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Fear AI|Personality")
    float Leadership = 0.5f;

    UPROPERTY(BlueprintAssignable, Category = "Fear AI|Events")
    FOnFearBandChanged OnFearBandChanged;

    UPROPERTY(BlueprintAssignable, Category = "Fear AI|Events")
    FOnActionIntentReceived OnActionIntentReceived;

    UPROPERTY(BlueprintAssignable, Category = "Fear AI|Events")
    FOnAudioHintsUpdated OnAudioHintsUpdated;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Fear AI|State")
    EFearBand CurrentFearBand = EFearBand::Calm;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Fear AI|State")
    float CurrentRawFear = 0.0f;

private:
    TSharedPtr<IWebSocket> WebSocket;
    void ConnectWebSocket();
    void ProcessStateJson(const FString& Message);
    EFearBand StringToFearBand(const FString& BandStr) const;
};
