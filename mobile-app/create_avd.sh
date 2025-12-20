#!/usr/bin/env sh

echo "no" | avdmanager create avd \
  --name pixel4a \
  --package "system-images;android-34;google_apis;x86_64" \
  --device "pixel_4a"
