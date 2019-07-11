{ pkgs ? (import <nixpkgs> {}) }:

let stdenv = pkgs.stdenv;

    # TODO figure out how to get node grpc plugin here
    intrustd-py-srcs =
      pkgs.fetchFromGitHub {
        owner = "intrustd";
        repo = "py-intrustd";
        rev = "3ded67ad1d153f7d3e969fce2f26e5f737a2a1c8";
        sha256 = "14dkz41n81vfppab2k4b8mc25ciqzwsr1wrw6slbsxi1znvdajsk";
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
       ps.zipstream
     ]))
    ffmpeg
  ];

  inherit intrustd-py;

#  CMAKE_
}
