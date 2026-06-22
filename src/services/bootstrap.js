const fs = require("fs");
const path = require("path");

// En hosts como Railway no siempre es práctico subir un archivo .json de
// credenciales. Si se define GOOGLE_SERVICE_ACCOUNT_JSON_BASE64, se escribe
// ese contenido al path indicado por GOOGLE_SERVICE_ACCOUNT_KEY_FILE antes
// de que el resto de la app lo necesite.
function ensureGoogleCredentialsFile() {
  const b64 = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64;
  if (!b64) return;

  const keyFile = path.resolve(
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE || "./google-service-account.json"
  );
  const json = Buffer.from(b64, "base64").toString("utf8");
  fs.mkdirSync(path.dirname(keyFile), { recursive: true });
  fs.writeFileSync(keyFile, json);
}

module.exports = { ensureGoogleCredentialsFile };
