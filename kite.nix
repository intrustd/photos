{ pkgs, ... }:
let grpc-io-tools = ps: ps.buildPythonPackage rec {
        pname = "grpcio-tools";
        version = "1.9.1";

        src = ps.fetchPypi {
          inherit pname version;
          sha256 = "0gv7a0jy2waa1jc32bvqahpm6pmbgvzpnp28lw0gz5csabbrndhh";
        };

        enableParallelBuilding = true;

        propagatedBuildInputs = with ps; [ pkgs.grpc grpcio ];

        # no tests in the package
        doCheck = false;

        meta = with pkgs.stdenv.lib; {
          description = "Protobuf code generator for gRPC";
          license = lib.licenses.asl20;
          homepage = "https://grpc.io/grpc/python/";
          maintainers = with maintainers; [ vanschelven ];
        };
      };

    python = pkgs.python3;

    photo-app = python.pkgs.buildPythonPackage rec {
      pname = "kite-photo";
      version = "0.1.0";

      src = ./.;

      doCheck = false;

      propagatedBuildInputs = with python.pkgs; [ flask sqlalchemy ];

      meta = {
        homepage = "https://flywithkite.com";
        description = "Kite Photos App";
      };
    };

in {
  kite.meta = {
     slug = "photos";
     name = "Kite Photos";
     authors = [ "Travis Athougies <travis@athougies.net>" ];
     app-url = "https://photos.flywithkite.com/";
     icon = "https://photos.flywithkite.com/images/photos.svg";
  };

  kite.identifier = "photos.flywithkite.com";

  kite.services.photo = {
    name = "photo";
    autostart = true;

    startExec = ''
      exec ${photo-app}/bin/photos
    '';

    environment = {
      KITEPHOTOS = "/kite/";
    };
  };

  kite.permissions = [
    { name = "comment";
      description = "Comment on photos"; }

    { name = "upload";
      description = "Upload photos"; }

    { name = "view";
      description = "View photos"; }

    { name = "gallery";
      description = "View all photos"; }

    { regex = "view/(?P<photoId>[A-Fa-f0-9]{32})";
      description = "View some photos";
      verifyCmd = "${photo-app}/bin/verify-photo-perm {photoId}"; }
  ];

#  kite.startHook = ''
#    export KITEPHOTOS=/kite/
#    exec ${photo-app}/bin/photos
#  '';
#
#  kite.healthCheckHook = ''
#    if echo | socat - TCP4:localhost:50051,connect-timeout=2; then
#      exit 0;
#    else
#      exit 1;
#    fi
#  '';
}
