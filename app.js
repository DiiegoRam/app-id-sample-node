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

// IMPORTANTE: Indicar a Express que confíe en el proxy de Render (HTTPS)
app.set('trust proxy', 1);

const CALLBACK_URL = "/ibm/cloud/appid/callback";

const port = process.env.PORT || 3000;

// Configuración de sesión optimizada para Render
app.use(session({
	secret: process.env.SESSION_SECRET || "123456",
	resave: true,
	saveUninitialized: true,
	proxy: true,
	cookie: {
		secure: false, // Cambiado a false temporalmente para evitar rechazo de cookies detrás del proxy SSL de Render
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

app.get(CALLBACK_URL, passport.authenticate(WebAppStrategy.STRATEGY_NAME, { failureRedirect: '/error' }));

// Protect everything under /protected
app.use("/protected", passport.authenticate(WebAppStrategy.STRATEGY_NAME, { session: true }));

// This will statically serve pages:
app.use(express.static("public"));

// This will statically serve the protected page:
app.use('/protected', express.static("protected"));

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

app.get('/error', (req, res) => {
	res.send('Authentication Error');
});

app.listen(port, () => {
	console.log("Listening on port " + port);
});

function getAppIDConfig() {
	let explicitRedirectUri = process.env.redirectUri;
	
	let config = {
		clientId: process.env.CLIENT_ID || process.env.clientId || "a2b47310-3d6a-49a3-b73f-e2c27cdeb25c",
		secret: process.env.SECRET || process.env.secret || "OWVmODA3YjAtZmVkZS00NmMzLWFkMWYtYWI0NDc5ZGEyODYx",
		tenantId: process.env.TENANT_ID || process.env.tenantId || "3e0457c8-a058-46f9-bf36-8d306259de9e",
		oauthServerUrl: process.env.OAUTHSERVERURL || process.env.oauthServerUrl || "https://us-south.appid.cloud.ibm.com/oauth/v4/3e0457c8-a058-46f9-bf36-8d306259de9e"
	};

	if (process.env.RENDER_EXTERNAL_URL) {
		config.redirectUri = process.env.RENDER_EXTERNAL_URL + CALLBACK_URL;
	} else if (explicitRedirectUri) {
		config.redirectUri = explicitRedirectUri;
	}

	return config;
}
