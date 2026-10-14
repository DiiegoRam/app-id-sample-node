/*
 Copyright 2019 IBM Corp.
 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at
 http://www.apache.org/licenses/LICENSE-2.0
 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
 */

const express = require("express");
const session = require("express-session");
const passport = require("passport");
const appID = require("ibmcloud-appid");

const WebAppStrategy = appID.WebAppStrategy;

const app = express();

// Indicar a Express que confíe en el proxy de IBM Cloud Code Engine (HTTPS)
app.set("trust proxy", 1);

const CALLBACK_URL = "/ibm/cloud/appid/callback";

const port = process.env.PORT || 3000;

// Sesión en memoria: usar UNA sola instancia (min-scale 1, max-scale 1).
// Para producción, usar un store externo como Redis.
app.use(session({
	secret: process.env.SESSION_SECRET || "cambia-esto-en-produccion",
	resave: true,
	saveUninitialized: true,
	proxy: true,
	cookie: {
		secure: false,
		httpOnly: true,
		maxAge: 24 * 60 * 60 * 1000 // 1 día
	}
}));

// Configure express application to use passportjs
app.use(passport.initialize());
app.use(passport.session());

let webAppStrategy = new WebAppStrategy(getAppIDConfig());
passport.use(webAppStrategy);

passport.serializeUser((user, cb) => cb(null, user));
passport.deserializeUser((obj, cb) => cb(null, obj));

app.get(CALLBACK_URL, passport.authenticate(WebAppStrategy.STRATEGY_NAME, { failureRedirect: "/error" }));

// Protect everything under /protected
app.use("/protected", passport.authenticate(WebAppStrategy.STRATEGY_NAME, { session: true }));

// This will statically serve pages:
app.use(express.static("public"));

// This will statically serve the protected page:
app.use("/protected", express.static("protected"));

app.get("/logout", (req, res) => {
	req._sessionManager = false;
	WebAppStrategy.logout(req);
	res.clearCookie("refreshToken");
	res.redirect("/");
});

// Serves the identity token payload
app.get("/protected/api/idPayload", (req, res) => {
	if (req.session && req.session[WebAppStrategy.AUTH_CONTEXT]) {
		res.send(req.session[WebAppStrategy.AUTH_CONTEXT].identityTokenPayload);
	} else {
		res.status(401).send("No autorizado");
	}
});

app.get("/error", (req, res) => {
	res.send("Authentication Error");
});

app.listen(port, () => {
	console.log("Listening on port " + port);
});

// Toda la configuración viene de variables de entorno (secreto de Code Engine)
function getAppIDConfig() {
	const config = {
		clientId: process.env.CLIENT_ID,
		secret: process.env.SECRET,
		tenantId: process.env.TENANT_ID,
		oauthServerUrl: process.env.OAUTHSERVERURL,
		redirectUri: process.env.redirectUri
	};

	const missing = Object.keys(config).filter((k) => !config[k]);
	if (missing.length) {
		console.warn("Faltan variables de entorno de App ID: " + missing.join(", "));
	}

	return config;
}
