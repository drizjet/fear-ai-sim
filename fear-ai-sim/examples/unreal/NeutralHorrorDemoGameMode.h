// NeutralHorrorDemoGameMode.h
// Canonical Horror Demo GameMode for Unreal Engine 5

#pragma once

#include "CoreMinimal.h"
#include "GameFramework/GameModeBase.h"
#include "FearAgentComponent.h"
#include "NeutralHorrorDemoGameMode.generated.h"

UCLASS()
class FEARAI_API ANeutralHorrorDemoGameMode : public AGameModeBase
{
    GENERATED_BODY()

public:
    ANeutralHorrorDemoGameMode();

    virtual void BeginPlay() override;

protected:
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "FearAI")
    UFearAgentComponent* DiazVeteranComponent;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "FearAI")
    UFearAgentComponent* ChenNoviceComponent;

    UFUNCTION()
    void OnDiazIntentChanged(const FFearActionIntent& Intent);

    UFUNCTION()
    void OnChenIntentChanged(const FFearActionIntent& Intent);

private:
    void StartHorrorSequence();
    void TriggerThreatArrival();
    void TriggerThreatVanished();
};
