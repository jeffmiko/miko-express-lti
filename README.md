# miko-express-lti

An ExpressJS route handler for LTI requests between a tool consumer such as Moodle, Canvas, etc. and your custom LTI application. Initially supports the most important features of LTI 1.3 and some LTI 1.1. More supported features will be coming. May add more LTI 1.1 support for backward compatibility.

### Supported
 - LTI 2.0 Assignment and Grade Services Specification ([spec](https://www.imsglobal.org/spec/lti-ags/v2p0))
 - LTI 2.0 Names and Role Provisioning Services ([spec](https://www.imsglobal.org/spec/lti-nrps/v2p0))
 - LTI 1.3 Resource link launch requests ([spec](http://www.imsglobal.org/spec/lti/v1p3#resource-link-launch-request-message))
 - LTI 1.1 Basic launch requests ([spec](https://www.imsglobal.org/specs/ltiv1p1p1/implementation-guide))

### Not Supported
 - LTI content selection requests
 - LTI registration requests
 - LTI 1.1 Outcome Management ([spec](https://www.imsglobal.org/specs/ltiomv1p0/specification))

## Usage

### Handling launch events

There are three functions that handle LTI launches. See the **launch.js** file in the **test** folder for an ExpressJS sample application.
 - **LtiLogin** handles the initial LTI 1.3 OpenID Connect (OIDC) handshake
 - **LtiVerify** handles the LTI 1.3 redirect to verify the OIDC handshake and extracts the LTI data
 - **LtiBasic** handles LTI 1.1 launch events using OAuth 1.0 and extracts the LTI data

#### Sample LTI 1.3 Code (test/launch.js)
  
	const  express = require("express")
	const  cors = require("cors")
	const  helmet = require("helmet")
	const  cookieParser = require("cookie-parser")
	const { LtiLogin, LtiVerify, LtiBasic } = require("miko-express-lti");

	// You need to implement these functions. 
	const  ltiservice = {
		async  findPlatform(params) { },
		async  useNonce(nonce, platform) { },
		async  addNonce(nonce, platform) { },
		async  getCache(key) { },
		async  setCache(key, value, ttl) { },
	}
	
	const  app = express()

	// allow up to 1 proxy
	app.set("trust proxy", 1)

	// Disabling frameguard so LTI apps can live in iframes
	app.use(helmet({ frameguard:  false, contentSecurityPolicy:  false}))

	// allow CORS since requests will come from LMS
	app.use(cors()) // allow all origins
	app.options('*', cors()) // allow pre-flights

	// body parsers
	app.use(express.urlencoded({ extended:  true }))
	app.use(express.json())
	app.use(express.raw())
	app.use(express.text())
	app.use(cookieParser("c21411f67ab2a4e243355a77307ec7e2"))

	// LTI 1.3 login URL specified in your LMS tool setup
	app.all('/oidclogin', LtiLogin({ service:  ltiservice }) )

	// LTI 1.3 redirect URL specified in your LMS tool setup
	// After odic login, the redirect URL is called.
	app.all('/ltiapp', LtiVerify({ service:  ltiservice }), async (req, res, next) => {
		// lti property has LTI data
		// just returning JSON, but could redirect to your app
		res.setHeader("Content-Type", "application/json")
		res.send(JSON.stringify(req.lti, null, 2))
	})


### Passing grades back to tool consumer 

The **LtiGradingService** class provides methods to publish scores, get current scores, and get the details for a line item. See the **grades.js** file in the **test** folder for a sample application.

### Getting a course roster from a tool consumer 

The **LtiNameRoleService** class provides methods to get learners, instructors, or all users enrolled in a course. See the **roster.js** file in the **test** folder for a sample application.


## Configuration

### Generating encryption keys

The LTI 1.3 and 2.0 require encryption keys for creating and validating JSON Web Tokens (JWTs). The **LtiKeySet** class provides methods to generate public and private keys in both PEM and JWK formats. See the **keyset.js** file in the **test** folder for a complete example.

### Providing an service object

This library requires you to provide a service object that contains 5 methods. The **LtiService** class provides an abstract class with these methods. See the **launch.js** file in the **test** folder for an example of an object that implements these methods. The methods are:
 - **findPlatform** uses parameters to locate and return a platform object. 
 - **addNonce** adds a new nonce to the a data store. The nonce must not already exist.
 - **useNonce** marks a nonce as being used. A nonce must exist and can only be used once.
 - **getCache** gets a value from cache based on a key. Optional. Can improve performance.
 - **setCache** saves a key/value pair to a cache of some type. Optional. Can improve performance.

### Tool consumer setup 

This varies based on the tool consumer or learning management system (LMS). 
 - For **Moodle**, see the [External Tools](https://docs.moodle.org/310/en/External_tool_settings#Registering_an_LTI_1.1_tool_using_a_cartridge) documentation
 - For **Canvas**, see [How do I configure an LTI key](https://community.canvaslms.com/t5/Admin-Guide/How-do-I-configure-an-LTI-key-for-an-account/ta-p/140) in the Admin Guide
 - For others, please see your tool consumer or LMS documentation.




