const crypto = require("crypto")
const url = require("url")


async function hashUpdate(hash, value) {
  if (value === null) return
  if (value === undefined) return
  if (typeof value === "object") {
    let keys = Object.keys(value).sort()
    for(let k of keys) {
      await hashUpdate(hash, value[k])
    }
  } else {
    if (value) await hash.update(value.toString())
  }
}

async function hashObject(value) {
  const hash = crypto.createHash("md5");
  await hashUpdate(hash, value)
  return hash.digest("hex")
}

function encodeRFC3986(value) {
  if (Array.isArray(value)) {
    for(let i=0; i < value.length; i++) {
      value[i] = encodeRFC3986(value[i])
    }
    return value
  } 
  return encodeURIComponent(value).replace(/[!'()*]/g, function(c) {
    return '%' + c.charCodeAt(0).toString(16);
  })
}  
  
function encodeParam(key, val){ 
  return `${key}=${encodeRFC3986(val)}` 
}

// OAuth links
// http://lti.tools/oauth/
// https://medium.com/@pandeysoni/how-to-create-oauth-1-0a-signature-in-node-js-7d477dead170
// http://www.imsglobal.org/specs/ltiv1p0/implementation-guide#toc-4
// https://developer.twitter.com/en/docs/authentication/oauth-1-0a/creating-a-signature#f1

function verifyRequestOAuth(req, secret, consumerKey) {

  let body = { ...req.query, ...req.body}

  if (!body.oauth_signature) throw new Error("The oauth_signature was not found.")
  if (!body.oauth_timestamp) throw new Error("The oauth_timestamp was not found.")
  if (consumerKey) {
    if (!body.oauth_consumer_key) throw new Error("The oauth_consumer_key was not found.")
    if (consumerKey != body.oauth_consumer_key) 
      throw new Error("The oauth_consumer_key does not match.")
  }

  let originalUrl = req.originalUrl || req.url
  if (body.tool_consumer_info_product_family_code == 'canvas')
    originalUrl = url.parse(originalUrl).pathname

  let protocol = req.protocol
  if (!protocol)
    protocol = (req.connection.encrypted && 'https') || 'http'
  
  let parsedUrl = url.parse(originalUrl, true)
  let hitUrl = protocol + '://' + req.headers.host + parsedUrl.pathname

  let out = []
  for(let [key, vals] of Object.entries(body)) {
    if (key == "oauth_signature") continue
    if (Array.isArray(vals)) 
      for (let val in vals) out.push(encodeParam(key, val))
    else out.push(encodeParam(key, vals))
  }

  let now = Date.now() / 1000
  let ts = parseInt(body.oauth_timestamp)
  let maxAge = 10*60*1000 // 10 minutes
  if (Math.abs(now - ts) > maxAge) throw new Error(`The oauth_timestamp has expired.`);

  hash = "sha1"
  if (body.oauth_signature_method) 
    hash = body.oauth_signature_method.toLowerCase().replace("hmac-", "")

  let encodedParams = encodeRFC3986(out.sort().join('&'))
  let sigBase = `${req.method.toUpperCase()}&${encodeRFC3986(hitUrl)}&${encodedParams}`
  let sig = crypto.createHmac(hash, `${encodeRFC3986(secret)}&`).update(sigBase).digest('base64')  
  
  if (sig != body.oauth_signature) throw new Error("The oauth_signature does not match.")    

}


function parseRoles(roles) {
  let result = {}
  for(let role of roles) {
    let parts = role.split("#")
    switch(parts[parts.length-1]) {
      case "Learner":
      case "Student":
        result.learner = true
        break
      case "Instructor":
      case "Member":
      case "Faculty":
        result.instructor = false
        break
      case "ContentDeveloper":
      case "Creator":
        result.developer = true
        break
      case "Mentor":
        result.mentor = true
        break
      case "Staff":
      case "Observer":
        result.staff = true
        break
      case "Administrator":
        result.admin = true
        break
      default:
        break
    }
  }
  return result  
}

function parseMemberRoles(roles) {
  let result = {}
  for(let role of roles) {
    let parts = role.split("#")
    switch(parts[0]) {
      case "Learner":
        result.learner = true
        break
      case "Instructor":
        if (parts.length > 1 && parts[1].includes("Assistant")) {
          result.assistant = true 
          result.instructor = false
        } else if (!result.assistant) {
          result.instructor = true
        }
        break
      case "ContentDeveloper":
        result.developer = true
        break
      case "Mentor":
        result.mentor = true
        break
      case "Administrator":
        result.admin = true
        break
      default:
        break
    }
  }
  return result
}


module.exports.hashObject = hashObject
module.exports.parseInstRoles = parseRoles
module.exports.parseSystemRoles = parseRoles
module.exports.parseMemberRoles = parseMemberRoles
module.exports.encodeRFC3986 = encodeRFC3986
module.exports.verifyRequestOAuth = verifyRequestOAuth
