{
  description = "Admin Frontend Tooling";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-25.11";
  };

  outputs = { self, nixpkgs }:
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
          nodejs_20
        ];

        shellHook = ''
					export PROJECT_PATH=$(pwd)
					echo "#######################################################"
					echo "# Tooling for admin frontend development activated    #"
					echo "#######################################################"
        '';
      };
    };
}
