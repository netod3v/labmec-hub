# Local voice filtering

Vendored from `@sapphi-red/web-noise-suppressor` **0.4.1**, npm tarball:
https://registry.npmjs.org/@sapphi-red/web-noise-suppressor/-/web-noise-suppressor-0.4.1.tgz

Integrity verified before copying:
`sha512-hy2GnF079+zi4n9BZUf+GGIQ1IofApAk6rgGMyMQ3soHfz/GKu1pcCsmePyIHVvUuv1LrFudw9BmmBqoOKay5w==`

The application uses RNNoise only, with mono input at 48 kHz. All JavaScript,
AudioWorklet and WebAssembly resources load from the Hub itself. No microphone
audio is uploaded to a noise suppression service.

Sources and licenses:

- https://github.com/sapphi-red/web-noise-suppressor — MIT, `LICENSE`.
- https://github.com/shiguredo/rnnoise-wasm — Apache-2.0, `RNNOISE-WASM-LICENSE`.
- https://github.com/xiph/rnnoise — BSD, `RNNOISE-LICENSE`.

Upstream artifacts are unmodified; unrelated worklets are not loaded by the app.
