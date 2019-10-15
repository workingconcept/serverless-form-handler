const lambda = require("../index.js");

beforeEach(() => {
    // set environment variables used for configuration
    process.env.TEST = true;
    process.env.SITE_NAME = "Working Concept";
    process.env.ROOT_REDIRECT = "https://wrkcpt.dev";
});

test(`root redirects`, () => {
    return lambda
        .handler({
            headers: { "Content-Type": "application/json" }
        })
        .then(response => {
            expect(response.statusCode).toBe(302);
            expect(response.headers.Location).toBe(process.env.ROOT_REDIRECT);
        });
});

test(`valid submission redirects`, () => {
    return lambda
        .handler({
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(getProjectBriefBody())
        })
        .then(response => {
            const responseData = JSON.parse(response.body);
            expect(responseData.success).toBe(true);

            expect(response.statusCode).toBe(302);
            expect(response.headers.Location).toBe(`https://yahoo.com`);
            expect(response.headers["Content-Type"]).toBe("application/json");
        });
});

test(`valid form submission redirects`, () => {
    return lambda
        .handler({
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: encodePostBody(getProjectBriefBody())
        })
        .then(response => {
            expect(response.statusCode).toBe(302);
            expect(response.headers.Location).toBe(`https://yahoo.com`);
            expect(response.headers["Content-Type"]).toBe("text/html");
        });
});

test(`valid submission returns success`, () => {
    let body = getProjectBriefBody();

    // leave out `redirect` field
    delete body.redirect;

    return lambda
        .handler({
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        })
        .then(response => {
            expect(response.statusCode).toBe(200);

            const responseData = JSON.parse(response.body);
            expect(responseData.success).toBe(true);
            expect(response.headers["Content-Type"]).toBe("application/json");
            // TODO: verify 'Form Submitted!' text in body
        });
});

test(`valid form submission displays success`, () => {
    let body = getProjectBriefBody();

    // leave out `redirect` field
    delete body.redirect;

    return lambda
        .handler({
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: encodePostBody(body)
        })
        .then(response => {
            expect(response.statusCode).toBe(200);
            expect(response.headers["Content-Type"]).toBe("text/html");
            expect(response.body).toContain(`Form Submitted!`);
        });
});

test(`valid form submission redirects`, () => {
    let body = getProjectBriefBody();

    return lambda
        .handler({
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: encodePostBody(body)
        })
        .then(response => {
            expect(response.statusCode).toBe(302);
            expect(response.headers["Content-Type"]).toBe("text/html");
            expect(response.headers.Location).toBe(`https://yahoo.com`);
        });
});

test(`invalid submission returns error`, () => {
    let body = getProjectBriefBody();

    // remove required field
    delete body.description;

    return lambda
        .handler({
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        })
        .then(response => {
            expect(response.statusCode).toBe(400);

            const responseData = JSON.parse(response.body);
            expect(responseData.success).toBe(false);
            expect(response.headers["Content-Type"]).toBe("application/json");
            expect(responseData.errors.description).toContain(
                `Project Description is required.`
            );
        });
});

test(`invalid form submission displays error`, () => {
    let body = getProjectBriefBody();

    // remove required field
    delete body.description;

    return lambda
        .handler({
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: encodePostBody(body)
        })
        .then(response => {
            expect(response.statusCode).toBe(400);
            expect(response.headers["Content-Type"]).toBe("text/html");
            expect(response.body).toContain(`Project Description is required.`);
        });
});

test(`invalid form ID displays error`, () => {
    let body = getProjectBriefBody();

    // leave out `redirect` field
    delete body.redirect;

    // provide invalid form ID
    body.form = `foo`;

    return lambda
        .handler({
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        })
        .then(response => {
            expect(response.statusCode).toBe(400);

            const responseData = JSON.parse(response.body);
            expect(responseData.success).toBe(false);
            expect(response.headers["Content-Type"]).toBe("application/json");
            // TODO: verify error in result
        });
});

test(`missing form ID displays error`, () => {
    let body = getProjectBriefBody();

    // leave out `redirect` field
    delete body.redirect;

    // remove form ID
    delete body.form;

    return lambda
        .handler({
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        })
        .then(response => {
            expect(response.statusCode).toBe(400);

            const responseData = JSON.parse(response.body);
            expect(responseData.success).toBe(false);
            expect(response.headers["Content-Type"]).toBe("application/json");
            // TODO: verify error in result
        });
});

test(`path-based form ID works`, () => {
    let body = getProjectBriefBody();

    // leave out `redirect` field
    delete body.redirect;

    // remove form ID
    delete body.form;

    return lambda
        .handler({
            headers: { "Content-Type": "application/json" },
            path: "/form/intake",
            body: JSON.stringify(body)
        })
        .then(response => {
            expect(response.statusCode).toBe(200);

            const responseData = JSON.parse(response.body);
            expect(responseData.success).toBe(true);
            expect(response.headers["Content-Type"]).toBe("application/json");
            // TODO: verify 'Form Submitted!' text in body
        });
});

test(`filled honeypot displays error`, () => {
    let body = getContactFormBody();

    body.fax = `555-555-5555`;

    return lambda
        .handler({
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        })
        .then(response => {
            const responseData = JSON.parse(response.body);
            expect(responseData.success).toBe(false);
            expect(response.statusCode).toBe(400);
            expect(response.headers["Content-Type"]).toBe("application/json");
        });
});

test(`empty honeypot succeeds`, () => {
    return lambda
        .handler({
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(getContactFormBody())
        })
        .then(response => {
            const responseData = JSON.parse(response.body);
            expect(responseData.success).toBe(true);

            expect(response.statusCode).toBe(302);
            expect(response.headers.Location).toBe(`https://google.com`);
            expect(response.headers["Content-Type"]).toBe("application/json");
        });
});

/**
 * Encodes data to be posted as `application/x-www-form-urlencoded` form.
 */
function encodePostBody(data) {
    return Object.keys(data)
        .map(
            key => encodeURIComponent(key) + "=" + encodeURIComponent(data[key])
        )
        .join("&");
}

function getProjectBriefBody() {
    return {
        form: `intake`,
        name: `Tobias Fünke`,
        email: `tobias@actorpull.me`,
        company: `Tobias Fünke Productions`,
        phone: `(555) 555-5555`,
        website: `https://hotmail.com/`,
        budget: `$4,000-$9,999`,
        start: `open/flexible`,
        description: `Lorem ipsum dolor sit amet, consectetur adipisicing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.`,
        redirect: `https://yahoo.com`
    };
}

function getContactFormBody() {
    return {
        form: `contact`,
        name: `Tobias Fünke`,
        email: `tobias@actorpull.me`,
        message: `Lorem ipsum dolor sit amet, consectetur adipisicing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.`,
        redirect: `https://google.com`,
        fax: ``
    };
}

function getSupportFormBody() {
    return {
        form: `support`,
        name: `Tobias Fünke`,
        email: `tobias@actorpull.me`,
        project: `Actor Pull Website`,
        priority: `Meh`,
        description: `Lorem ipsum dolor sit amet, consectetur adipisicing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.`,
        redirect: `https://google.com`
    };
}
