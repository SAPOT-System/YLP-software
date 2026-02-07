# Notes

## Get Started

To run the app to your device, ensure that your computer have access to your device.

In terminal, run this:

```bash
npx expo prebuild
npx expo run:android
```

## Notes about `app.json` and native config

- The project is fully Bare.
- Native folder (`android/`) are authoritative.
- Some plugins exist in app.json for JS-only purposes.
- Native modifications for libraries like WebRTC, TCP socket, Zeroconf are applied manually.
- Prebuild is NOT run.
- Expo Doctor warning about config sync is intentionally ignored.
