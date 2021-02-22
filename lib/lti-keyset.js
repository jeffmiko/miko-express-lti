const rasha = require("rasha")
const crypto = require("crypto")

// ASSUMES ALL KEYS RS256 using "pkcs8" for private and "spki" for public

// How to manually generate How to generate JWT RS256 key 
// https://gist.github.com/ygotthilf/baa58da5c3dd1f69fae9

// RESOURCES
// https://coolaj86.com/articles/new-in-node-native-rsa-ec-and-dsa-support/
// https://git.coolaj86.com/coolaj86/rasha.js


class LtiKeySet {


  static async toPem(jwk, isprivate=false) {
    if (isprivate)
      return rasha.export({ jwk, format: "pkcs8" }).then(pem => { 
        if (pem.slice(-1) == "\n")
          return pem;
        else
          return pem+"\n";
      });
    else 
      return rasha.export({ jwk, format: "spki", public: "spki" }).then(pem => {
        if (pem.slice(-1) == "\n")
          return pem;
        else
          return pem+"\n";
      });
  }

  static async toJwk(pem, kid) {
    return rasha.import({ pem: pem }).then(jwk => {
      if (kid) jwk.kid=kid;
      jwk.kty="RSA";
      jwk.alg="RS256";
      jwk.use="sig";
      return jwk;
    })
  }

  static async createPem() {
    return new Promise((resolve, reject) => {
      crypto.generateKeyPair("rsa", {
        modulusLength: 2048,
        publicKeyEncoding: {
          type: "spki",
          format: "pem"
        },
        privateKeyEncoding: {
          type: "pkcs8",
          format: "pem",
        }
      }, (err, publicpem, privatepem) => {
        if (err) reject(err);
        else {
          resolve({
            kid: crypto.randomBytes(16).toString("hex"),
            publicpem, privatepem
          });
        }
      });
    })  
  }

  static async createJwks(pem = null) {
    if (!pem) pem = await LtiKeySet.createPem()
    if (!pem.publicpem) throw "Missing public key property"
    if (!pem.privatepem) throw "Missing private key property"
    if (!pem.kid) pem.kid = crypto.randomBytes(16).toString("hex")
    return {
      kid: pem.kid,
      privatejwk: await LtiKeySet.toJwk(pem.privatepem, pem.kid),
      publicjwk: await LtiKeySet.toJwk(pem.publicpem, pem.kid),
    }
  }

  static async compare(jwk, pem) {
    let jwkpem = await LtiKeySet.toPem(jwk, !!jwk.d)
    return jwkpem == pem
  }
  
  static async create() {
    let pem = await LtiKeySet.createPem()
    let jwks = await LtiKeySet.createJwks(pem)
    return Object.assign(pem, jwks)
  }
  

}


module.exports.LtiKeySet = LtiKeySet