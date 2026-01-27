{
  description = "Syncing backend tooling";

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
    in
    {
      devShells.${system}.default = pkgs.mkShell {
        buildInputs = with pkgs; [
          virtualenv
          python313
          pyright
          pyenv
        ];

        shellHook = ''
             export PROJECT_PATH=$(pwd)
              echo "#######################################################"
              echo "# Tooling for server development activated            #"
              echo "#######################################################"
        '';
      };
    };
}
