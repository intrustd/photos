import <intrustd/nix/hydra-app-jobsets.nix> {
  description = "Intrustd Photos App";
  src = { type = "git"; value = "git://github.com/intrustd/photos.git"; emailresponsible = true; };
}
