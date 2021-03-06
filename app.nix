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

    py-intrustd = (import ./shell.nix { inherit pkgs; }).intrustd-py;

    photo-app = python.pkgs.buildPythonPackage rec {
      pname = "intrustd-photo";
      version = "0.1.0";

      src = ./.; #dist/intrustd-photos-0.1.0.tar.gz; # ./.;

      doCheck = false;

      propagatedBuildInputs = with python.pkgs;
        [ flask sqlalchemy requests pillow py-intrustd python_magic
          zipstream ];

      meta = {
        homepage = "https://photos.intrustd.com";
        description = "Intrustd Photos App";
      };
    };

in {

  app.version.major = 0;
  app.version.minor = 5;

  app.meta = {
     slug = "photos";
     name = "Intrustd Photos";
     authors = [ "Travis Athougies <travis@athougies.net>" ];
     app-url = "https://photos.intrustd.com/";
     icon = "https://photos.intrustd.com/images/photos.svg";
  };

  app.identifier = "photos.intrustd.com";

  app.services.photo = {
    name = "photo";
    autostart = true;

    startExec = ''
      exec ${photo-app}/bin/photos
    '';
  };

  app.systemPackages = [ pkgs.ffmpeg photo-app pkgs.tcpdump ];

  app.environment = {
    INTRUSTDPHOTOS = "/intrustd/";
  };

  app.permsHook = "${photo-app}/bin/photo-perms";

  app.permissions = [
    { name = "comment";
      description = "Comment on photos"; }

    { name = "upload";
      description = "Upload photos"; }

    { name = "upload/guest";
      description = "Upload photos as guest"; }

    { name = "view";
      description = "View photos"; }

    { name = "gallery";
      description = "List all photos"; }

    { name = "albums/create";
      description = "Create Albums"; }

    { name = "albums/view";
      description = "View All Albums";
      dynamic = true; }

    { name = "albums/(?P<album_Id>[0-9a-fA-F]{8}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{12})/upload/guest";
      description = "Upload photos to album as a guest"; }

    { regex = "albums/(?P<album_Id>[0-9a-fA-F]{8}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{12})/view";
      description = "View a particular album";
      dynamic = true; }

    { regex = "view/(?P<photo_id>[A-Fa-f0-9]{64})";
      description = "View some photos";
      dynamic = true; }
  ];

}
