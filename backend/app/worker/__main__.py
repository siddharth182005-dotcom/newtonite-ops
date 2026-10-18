import sys

from .runner import main

main(once="--once" in sys.argv)
