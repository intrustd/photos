let pkgs = import <nixpkgs> {};
in {
  jobsets =
    let spec = {
          app = {
            enabled = 1;
            hidden = false;
            description = "Kite Photos App";
            nixexprinput = "kite";
            nixexprpath = "nix/build-hydra.nix";
            checkinterval = 300;
            schedulingshares = 50;
            enableemail = true;
            emailoverride = "";
            keepnr = 3;
            inputs = {
              nixpkgs = { type = "git"; value = "git://github.com/kitecomputing/nixpkgs.git kite"; emailresponsible = true; };
              kite = { type = "git"; value = "git://github.com/kitecomputing/kite.git"; emailresponsible = true; };
              src = { type = "git"; value = "git://github.com/kitecomputing/photos.git"; emailresponsible = true; };
            };
          };
        };
    in pkgs.writeText "spec.json" (builtins.toJSON spec);
}
