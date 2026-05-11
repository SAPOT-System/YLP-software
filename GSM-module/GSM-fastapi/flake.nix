{
  description = "Tooling for GSM module";

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
          virtualenv
          python313
          pyright
          pyenv
					python313Packages.pip
        ];

        shellHook = ''
             export PROJECT_PATH=$(pwd)
              echo "#######################################################"
              echo "# Tooling for server development activated            #"
              echo "#######################################################"

              source ./venv/bin/activate
							alias run='SERIAL_PORT=/dev/ttyACM1 python main.py'
        '';
      };
    };
}
