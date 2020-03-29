{ pkgs ? (import <nixpkgs> { config.android_sdk.accept_license = true; config.allowUnfree = true;}) }:

let stdenv = pkgs.stdenv;

    # TODO figure out how to get node grpc plugin here
    intrustd-py-srcs =
      pkgs.fetchFromGitHub {
        owner = "intrustd";
        repo = "py-intrustd";
        rev = "0a1e7114fb44ce9736a8fe88eb21e345c746db7a";
        sha256 = "04h5b508ndz23z70k2adh2qh2cddkqjx2n7i8vnqbyvjlgcxmck8";
      };

    intrustd-py = pkgs.callPackage intrustd-py-srcs { };

    usrsctp = pkgs.stdenv.mkDerivation rec {
       name = "usrsctp-${rev}";
       rev = "348a36c8b38a53b34087214b87565e9207c5469b";
       src = pkgs.fetchFromGitHub {
         owner = "sctplab";
         repo = "usrsctp";
         rev = rev;
         sha256 = "0zr65q58a8i6daw2xqd3nmp5cd2q2ai1bcqf289lar3bli1fz7dr";
       };

       nativeBuildInputs = [ pkgs.libtool pkgs.autoconf pkgs.automake pkgs.pkgconfig ];

       configureFlags = [ "--disable-warnings-as-errors" ];

       patchPhase = ''
         substituteInPlace ./Makefile.am --replace "# pkgconfig" "pkgconfig"
         substituteInPlace ./configure.ac --replace "dnl PKG_PROG_PKG_CONFIG" "PKG_PROG_PKG_CONFIG"
         substituteInPlace ./configure.ac --replace "dnl PKG_INSTALLDIR" "PKG_INSTALLDIR"
         substituteInPlace ./configure.ac --replace "dnl AC_CONFIG_FILES([usrsctp.pc])" "AC_CONFIG_FILES([usrsctp.pc])"
       '';

       preConfigure = ''
         libtoolize
         aclocal
         autoconf
         automake --foreign --add-missing --copy
       '';
   };

#   lksctp-tools-1-0-18 = pkgs.callPackage ./deploy/pkgs/lksctp-tools.nix { };

  run-android = pkgs.callPackage ../mobile.nix { node = pkgs.nodejs-8_x; };

in pkgs.stdenv.mkDerivation {
  name = "intrustd-cpp";

  buildInputs = with pkgs; [
    pkgconfig cmake gdb openssl_1_1.dev
    uriparser nodejs-8_x
    uthash zlib check

    ncat cacert

    valgrind stun graphviz awscli

    sqlite

    nginx jq redis

    nix-prefetch-git nodePackages.node2nix

    (python3.withPackages (ps: [
       ps.flask ps.sqlalchemy ps.pyopenssl ps.pyudev ps.celery ps.redis
       ps.kombu ps.pytest ps.requests ps.pillow intrustd-py ps.python_magic
       ps.zipstream ps.pylint ps.selenium
     ]))
    ffmpeg chromedriver mediainfo

#    run-android
#    nodePackages.react-native-cli jdk
#    android.androidsdk android-studio

#    gradle nodePackages.cordova nodePackages.ionic
  ];

  inherit intrustd-py;

  GOOGLE_CHROME="${pkgs.google-chrome}/bin/google-chrome-stable";
  ANDROID_JAVA_HOME="${pkgs.jdk.home}";
#  ANDROID_SDK_ROOT = "${android.androidsdk}/libexec/android-sdk";
#  ANDROID_HOME = "${android.androidsdk}/libexec/android-sdk";

#  CMAKE_
}
