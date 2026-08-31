# replit.nix
#
# WHAT THIS IS. The system packages available inside the Replit container, on top of the
# language module named in .replit.
#
# WHY IT EXISTS. ge is 14,723 lines of POSIX shell and it calls out to the system: mktemp,
# readlink, date and sort. Those behave differently between GNU and BSD builds, and ge
# carries compatibility code for exactly that reason. Pinning the packages here means the
# behaviour the 32 case suite proves in CI is the behaviour founders get on the day.
#
# HONEST NOTE. When .replit sets `modules`, Replit provides the toolchain itself and this
# file is merged rather than authoritative. Treat it as the list of extra tools, and treat
# the probe's output as the truth about what is actually in the image. The probe runs
# mktemp, readlink, date and sort for real and prints what they did, precisely because a
# package list is a claim and a probe is evidence.

{ pkgs }: {
  deps = [
    # Node 22, matching the `modules` entry in .replit. Built with full ICU in nixpkgs,
    # which is what makes America/New_York resolve. Verified at boot, not assumed.
    pkgs.nodejs_22

    # Not for the content repo any more. That was a pinned submodule and it is now vendored
    # into vendor/, so a remix into a founder's own account needs no GitHub credential and no
    # submodule step. git stays because ge and the deployment probe both shell out to it.
    pkgs.git

    # psql, for reading the record by hand during the fix window on 24 September. A recovery
    # path that needs a deploy is no use during the fix window.
    pkgs.postgresql_16

    # coreutils and findutils, named rather than assumed, because ge shells out to them.
    pkgs.coreutils
    pkgs.findutils

    # dash. The 32 case suite runs twice, once under the image's own /bin/sh and once with
    # dash forced onto the front of PATH. Keeping dash in the image is what lets CI run the
    # second half inside the deployment image rather than on somebody's Mac.
    pkgs.dash
  ];
}
