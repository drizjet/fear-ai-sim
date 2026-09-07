// Copyright (c) 2026 Fear AI Universal Middleware. All Rights Reserved.

#include "FearAIModule.h"
#include "Modules/ModuleManager.h"

#define LOCTEXT_NAMESPACE "FFearAIModule"

void FFearAIModule::StartupModule()
{
    // This code will execute after your module is loaded into memory; the exact timing is specified in the .uplugin file per-module
    UE_LOG(LogTemp, Log, TEXT("Fear AI Universal Middleware Module initialized."));
}

void FFearAIModule::ShutdownModule()
{
    // This function may be called during shutdown to clean up your module.  For modules that support dynamic reloading,
    // we call this function before unloading the module.
    UE_LOG(LogTemp, Log, TEXT("Fear AI Universal Middleware Module shutdown."));
}

#undef LOCTEXT_NAMESPACE

IMPLEMENT_MODULE(FFearAIModule, FearAI)
