{
  description = "React Native + Expo Android Development Environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-25.11";
    android-nixpkgs.url = "github:tadfisher/android-nixpkgs";
    android-nixpkgs.inputs.nixpkgs.follows = "nixpkgs";
  };

  outputs = { self, nixpkgs, android-nixpkgs }:
    let
      system = "x86_64-linux";
      pkgs = import nixpkgs {
        inherit system;
        config.allowUnfree = true;
      };

      # Configure the Android SDK
      sdk = android-nixpkgs.sdk.${system} (sdkPkgs: with sdkPkgs; [
        cmdline-tools-latest
        build-tools-36-0-0
        build-tools-34-0-0 # <--- ADDED: React Native often looks for version 34.0.0 specifically
        build-tools-35-0-0 # <--- ADDED: React Native often looks for version 34.0.0 specifically
        build-tools-33-0-0 # <--- ADDED: React Native often looks for version 34.0.0 specifically
        platform-tools
        platforms-android-36
        platforms-android-34 # <--- ADDED: Older APIs are often required for compatibility
        platforms-android-35 # <--- ADDED: Older APIs are often required for compatibility
        platforms-android-33 # <--- ADDED: Older APIs are often required for compatibility
        emulator
        system-images-android-36-google-apis-x86-64
      ]);
    in
    {
      devShells.${system}.default = pkgs.mkShell {
        buildInputs = with pkgs; [
          # Node and Package Management
          nodejs_20
          nodePackages.eas-cli

          # Native dependencies
          sdk
          jdk17
          watchman # Highly recommended for React Native

          # editors
          neovim
          vscode
        ];

        shellHook = ''
          export ANDROID_HOME=${sdk}/share/android-sdk
          export ANDROID_SDK_ROOT=$ANDROID_HOME
          export JAVA_HOME=${pkgs.jdk17.home}
          export PROJECTPATH=$(pwd)

          export ANDROID_HOME="$HOME/.android-sdk-nix-overlay"
          mkdir -p "$ANDROID_HOME"

          ln -sfn ${sdk}/share/android-sdk/* "$ANDROID_HOME/"

          export ANDROID_SDK_ROOT=$ANDROID_HOME
          export JAVA_HOME=${pkgs.jdk17.home}

          adb reverse tcp:8081 tcp:8081


          # aliases to make life easier
          alias reloadADB='adb kill-server && adb start-server && adb devices'
          alias magic-fix='adb reverse tcp:8081 tcp:8081'
          alias start-local-android='cd $PROJECTPATH/sapot-mobile-app && npx expo start --localhost --android'
          alias androidVM='emulator -avd pixel4a'

          # Add SDK tools to PATH
          export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"

          echo "React Native / Expo Dev Environment Loaded"
          echo ""
          echo "Android SDK: $ANDROID_HOME"
          echo "Java: $(java -version 2>&1 | head -n 1)"
          echo ""
          echo "###############################################################################"
          echo "# commands:"
          echo "# reloadADB             - reload adb and scan for devices"
          echo "# magic-fix             - fix the sometimes not working renders in android phone"
          echo "# bash create_avd.sh    - create the pixel4a VM"
          echo "# androidVM             - run the pixel4a VM"
          echo "# start-expo-android    - start the (expo) server"
          echo "# run-android           - run the android server"
          echo "###############################################################################"
          echo ""
        '';
      };
    };
}
