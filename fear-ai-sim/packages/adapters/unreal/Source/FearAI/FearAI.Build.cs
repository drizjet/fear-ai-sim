// Copyright (c) 2026 Fear AI Universal Middleware. All Rights Reserved.

using UnrealBuildTool;

public class FearAI : ModuleRules
{
    public FearAI(ReadOnlyTargetRules Target) : base(Target)
    {
        PCHUsage = ModuleRules.PCHUsageMode.UseExplicitOrSharedPCHs;

        PublicIncludePaths.AddRange(
            new string[] {
                // Public include paths
            }
        );

        PrivateIncludePaths.AddRange(
            new string[] {
                // Private include paths
            }
        );

        PublicDependencyModuleNames.AddRange(
            new string[]
            {
                "Core",
                "CoreUObject",
                "Engine",
                "WebSockets",
                "Json",
                "JsonUtilities"
            }
        );

        PrivateDependencyModuleNames.AddRange(
            new string[]
            {
                // Private dependencies
            }
        );
    }
}
