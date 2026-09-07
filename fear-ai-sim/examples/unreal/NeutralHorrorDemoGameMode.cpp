// NeutralHorrorDemoGameMode.cpp
// Implementation of Canonical Horror Demo GameMode for Unreal Engine 5

#include "NeutralHorrorDemoGameMode.h"
#include "TimerManager.h"
#include "Engine/World.h"

ANeutralHorrorDemoGameMode::ANeutralHorrorDemoGameMode()
{
    PrimaryActorTick.bCanEverTick = true;
}

void ANeutralHorrorDemoGameMode::BeginPlay()
{
    Super::BeginPlay();

    UE_LOG(LogTemp, Log, TEXT("[FearAI UE5 Demo] Initializing Canonical Horror Encounter..."));

    // Diaz Veteran traits
    if (DiazVeteranComponent)
    {
        DiazVeteranComponent->AgentId = TEXT("diaz_veteran");
        DiazVeteranComponent->AgentName = TEXT("Veteran Diaz");
        DiazVeteranComponent->Fear = 0.3f;
        DiazVeteranComponent->Neuroticism = 0.2f;
        DiazVeteranComponent->Resilience = 0.85f;
        DiazVeteranComponent->Leadership = 0.7f;
        DiazVeteranComponent->OnIntentChanged.AddDynamic(this, &ANeutralHorrorDemoGameMode::OnDiazIntentChanged);
    }

    // Chen Novice traits
    if (ChenNoviceComponent)
    {
        ChenNoviceComponent->AgentId = TEXT("chen_novice");
        ChenNoviceComponent->AgentName = TEXT("Novice Chen");
        ChenNoviceComponent->Fear = 0.6f;
        ChenNoviceComponent->Neuroticism = 0.85f;
        ChenNoviceComponent->Resilience = 0.2f;
        ChenNoviceComponent->Leadership = 0.1f;
        ChenNoviceComponent->OnIntentChanged.AddDynamic(this, &ANeutralHorrorDemoGameMode::OnChenIntentChanged);
    }

    StartHorrorSequence();
}

void ANeutralHorrorDemoGameMode::StartHorrorSequence()
{
    // Phase 1: Calm patrol (3 seconds)
    UE_LOG(LogTemp, Log, TEXT("[FearAI UE5 Demo] Phase 1: Calm Patrol."));
    
    FTimerHandle ThreatTimer;
    GetWorldTimerManager().SetTimer(ThreatTimer, this, &ANeutralHorrorDemoGameMode::TriggerThreatArrival, 3.0f, false);
}

void ANeutralHorrorDemoGameMode::TriggerThreatArrival()
{
    // Phase 2: Stalker appears 4m from Diaz
    UE_LOG(LogTemp, Log, TEXT("[FearAI UE5 Demo] Phase 2: Apex Stalker appears near Diaz!"));
    if (DiazVeteranComponent)
    {
        DiazVeteranComponent->ReportThreat(TEXT("apex_stalker"), TEXT("PREDATOR"), 4.0f, 1.0f);
    }

    FTimerHandle VanishTimer;
    GetWorldTimerManager().SetTimer(VanishTimer, this, &ANeutralHorrorDemoGameMode::TriggerThreatVanished, 8.0f, false);
}

void ANeutralHorrorDemoGameMode::TriggerThreatVanished()
{
    // Phase 4: Stalker vanishes into darkness
    UE_LOG(LogTemp, Log, TEXT("[FearAI UE5 Demo] Phase 4: Threat vanished. Entering panic recovery."));
    if (DiazVeteranComponent)
    {
        DiazVeteranComponent->ClearThreats();
    }
}

void ANeutralHorrorDemoGameMode::OnDiazIntentChanged(const FFearActionIntent& Intent)
{
    UE_LOG(LogTemp, Log, TEXT("[Diaz Intent] Type: %s, Urgency: %f"), *Intent.Type, Intent.Urgency);
    // Host game authoritative execution: Drive character AI Controller / Behavior Tree
}

void ANeutralHorrorDemoGameMode::OnChenIntentChanged(const FFearActionIntent& Intent)
{
    UE_LOG(LogTemp, Log, TEXT("[Chen Intent] Type: %s, Urgency: %f"), *Intent.Type, Intent.Urgency);
    // Host game authoritative execution: Trigger flee / seek cover animation
}
