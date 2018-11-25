let pkgs = import <nixpkgs> {};
in {
  jobsets =
    let spec = {
          app = {
            enabled = 1;
            hidden = false;
            description = "Kite Photos App";
            nixexrinput = "kite";
            nixexprpath = "hydra/build-app.nix";
            checkinterval = 300;
            schedulingshares = 50;
            enableemail = true;
            enableoverride = "";
            keepnr = 3;
            inputs = {
              nixpkgs = { type = "git"; value = "git://github.com/kitecomputing/nixpkgs.git kite"; emailresponsible = true; };
              kite = { type = "git"; value = "git://github.com/kitecomputing/kite-system.git"; emailresponsible = true; };
              src = { type = "git"; value = "git://github.com/kitecomputing/photos.git"; emailresponsible = true; };
            };
          };
        };
    in pkgs.writeText "spec.json" (builtins.toJSON spec);
}
