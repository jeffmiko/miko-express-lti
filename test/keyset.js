const { LtiKeySet } = require("../lib/index")
const fs = require("fs")

async function createKeys() {
  let keys = await LtiKeySet.create()
  fs.writeFileSync("./test/keys/public.kid", keys.kid)
  fs.writeFileSync("./test/keys/private.jwk", JSON.stringify(keys.privatejwk, null, 2))
  fs.writeFileSync("./test/keys/private.pem", keys.privatepem)
  fs.writeFileSync("./test/keys/public.jwk", JSON.stringify(keys.publicjwk, null, 2))
  fs.writeFileSync("./test/keys/public.pem", keys.publicpem)
}


createKeys()
