const minify = require("html-minifier").minify;
const { IncomingWebhook } = require("@slack/webhook");

class FormHandler {
    constructor(event, forms, config) {
        this.mailer = require("mailgun.js");
        this.mailgunDomain = config.mailgunDomain || null;
        this.mailgunKey = config.mailgunKey || null;
        this.slackChannel = config.slackChannel || null;
        this.slackEndpoint = config.slackEndpoint || null;
        this.event = event;
        this.forms = forms;
        this.payload = this.getPayload();
        this.formConfig = this.getFormConfig();
        this.sent = false;
        this.errors = {};
        this.filteredFormFields = [];

        /**
         * The output from a Lambda proxy integration must be
         * in the following JSON object. The 'headers' property
         * is for custom response headers in addition to standard
         * ones. The 'body' property  must be a JSON string. For
         * base64-encoded payload, you must also set the 'isBase64Encoded'
         * property to 'true'.
         */

        // default response redirects
        this.response = {
            statusCode: 302,
            headers: {
                Location: config.defaultRedirect
            }
        };

        if (config.allowedOrigins) {
            const origin = event.headers.origin;
            const allowedOrigins = config.allowedOrigins.split(",");

            if (allowedOrigins.includes(origin)) {
                this.response.headers = {
                    ...this.response.headers,
                    "Access-Control-Allow-Origin": origin
                };
            }
        }
    }

    /**
     * Gets the form configuration that corresponds with the provided
     * form ID, or returns false if there's no match.
     */
    getFormConfig() {
        if (!this.hasValidPayload()) {
            return false;
        }

        const formId = this.getFormId();

        for (const [id, config] of Object.entries(this.forms)) {
            if (id === formId) {
                return config;
            }
        }

        return false;
    }

    /**
     * Gets the provided form ID from either a `form` field or the
     * request path, or false if neither was found.
     */
    getFormId() {
        if (this.payload.form) {
            // return value of `form` field
            return this.payload.form;
        }

        /**
         * check request path for `form/{id}`
         * path also availalable at event.requestContext.resourcePath
         */

        if (this.event.path) {
            const pieces = this.event.path.split("/").filter(String);

            if (pieces.length >= 2 && pieces[0] === `form`) {
                return pieces[1];
            }
        }

        return false;
    }

    /**
     * Gets the content type of the request.
     */
    getContentType() {
        return (
            this.event.headers["Content-Type"] ||
            this.event.headers["content-type"]
        );
    }

    /**
     * Gets the decoded post body from the request, expecting either AJAX
     * via `application/json` or a form post with `application/x-www-form-urlencoded`.
     */
    getPayload() {
        if (this.payload) {
            return this.payload;
        }

        if (this.event.body) {
            let body = this.event.body;

            if (this.event.headers) {
                const bodyIsString = typeof body === "string";
                const contentType = this.getContentType();

                if (bodyIsString && this.event.isBase64Encoded) {
                    body = atob(body);
                }

                if (bodyIsString && contentType.includes("application/json")) {
                    return JSON.parse(body);
                }

                if (
                    bodyIsString &&
                    contentType.includes("application/x-www-form-urlencoded")
                ) {
                    const querystring = require("querystring");
                    return querystring.decode(body);
                }
            }

            this.payload = body;

            return body;
        }

        return false;
    }

    /**
     * Returns true if a valid form configuration was found matching the request's form ID.
     */
    hasValidForm() {
        return this.formConfig !== false;
    }

    /**
     * Returns true if we have any form ID and a readable post payload.
     */
    hasFormId() {
        return this.hasValidPayload() && this.getFormId();
    }

    /**
     * Returns true if a readable post payload was provided.
     */
    hasValidPayload() {
        return this.payload !== false;
    }

    /**
     * Returns true if field validation errors were collected.
     */
    hasErrors() {
        return Object.keys(this.errors).length !== 0;
    }

    /**
     * Returns an array of field validation errors indexed by field name.
     */
    getErrors() {
        return this.errors;
    }

    /**
     * Returns true if notifications were sent successfully.
     * This doesn't mean Mailgun or Slack were happy, just that we attempted
     * to send them.
     */
    didSend() {
        return this.sent;
    }

    /**
     * Returns true if the post included a redirect to be sent after a
     * successful submission.
     */
    getPostSubmitRedirect() {
        if (typeof this.payload.redirect === "string") {
            return this.payload.redirect;
        }

        return false;
    }

    /**
     * Validates posted form fields.
     */
    validateFormFields() {
        const excludeNames = [
            `redirect`,
            `ip_address`,
            `ipAddress`,
            `ip`,
            `system`
        ];

        for (const [fieldName, fieldSettings] of Object.entries(
            this.formConfig.fields
        )) {
            let fieldValue = this.payload[fieldName];

            const field = fieldSettings;

            field.name = fieldName;
            field.value = this.validateField(
                fieldValue,
                fieldName,
                fieldSettings
            );

            if (field.value) {
                this.filteredFormFields.push(field);
            }
        }

        return this.hasErrors() === false;
    }

    /**
     * Validates an individual form field, cleaning up its value in the process.
     */
    validateField(fieldValue, fieldName, fieldSettings) {
        const fieldLabel = fieldSettings.label || fieldName;

        if (fieldValue && typeof fieldValue === "string") {
            fieldValue = fieldValue.trim();
        }

        if (
            fieldSettings.required &&
            (!fieldValue || fieldValue.length === 0 || !fieldValue.trim())
        ) {
            this.errors[fieldName] = [`${fieldLabel} is required.`];
        }

        if (
            fieldSettings.honeypot &&
            fieldSettings.honeypot === true &&
            fieldValue &&
            fieldValue !== ""
        ) {
            this.errors[fieldName] = [`${fieldLabel} must be empty.`];
        }

        if (fieldSettings.method) {
            if (fieldSettings.method === "getIpAddress") {
                fieldValue = this.getIpAddress();
            } else if (fieldSettings.method === "getSystemDetails") {
                fieldValue = this.getSystemDetails();
            }
        }

        return fieldValue;
    }

    /**
     * Gets the user IP address that corresponded with the post.
     */
    getIpAddress() {
        const userIp = this.event.headers["X-Forwarded-For"] || ``;

        return userIp;
    }

    /**
     * Gets the user's system details that corresponded with the post.
     */
    getSystemDetails() {
        const useragent = require("useragent");
        const agent = useragent.parse(this.event.headers["User-Agent"]);

        return agent.toString();
    }

    /**
     * Gets markup for the nofitication email.
     */
    getMessageHtml() {
        const htmlMessage = this.addContentToEmail(`
            <h1 style="margin: 0 0 25px 0; font-size: 25px; line-height: 30px; color: #333; font-weight: normal;">
                New ${this.formConfig.label} Submission
            </h1>

            ${this.filteredFormFields
                .map(
                    item => `
                <p>
                    <b style="color: #61899b;">${item.label}</b>
                    <br>
                    ${this.nl2br(item.value)}
                </p>
            `
                )
                .join("")}
        `);

        return htmlMessage;
    }

    /**
     * Converts newlines to HTML break elements.
     * https://stackoverflow.com/a/7467863/897279
     */
    nl2br(string, xhtml = false) {
        if (typeof string === "undefined" || string === null) {
            return "";
        }
        const breakTag = xhtml ? "<br/>" : "<br>";
        return (string + "").replace(
            /([^>\r\n]?)(\r\n|\n\r|\r|\n)/g,
            "$1" + breakTag + "$2"
        );
    }

    /**
     * Gets plain text version of the notification email.
     */
    getMessageText() {
        return ``;
    }

    /**
     * Sends a notification email via Mailgun's API.
     */
    async send(callback) {
        this.sendSlackNotification();

        if (this.mailgunDomain && this.mailgunKey) {
            const client = this.mailer.client({
                username: "api",
                key: this.mailgunKey
            });

            const message = {
                from: this.replaceTags(this.formConfig.from),
                to: this.getToAddresses(),
                subject: this.replaceTags(this.formConfig.subject),
                text: this.getMessageText(),
                html: this.getMessageHtml()
            };

            // https://www.npmjs.com/package/mailgun.js
            return client.messages
                .create(this.mailgunDomain, message)
                .then(() => {
                    console.log(`Mailgun message sent.`);
                    this.onFinished(callback);
                })
                .catch(err => console.log(err));
        } else {
            return this.onFinished(callback);
        }
    }

    /**
     * Combines to and bcc addresses for sending.
     */
    getToAddresses() {
        let addresses = [this.formConfig.to];

        if (this.formConfig.bcc) {
            addresses.push(this.formConfig.bcc);
        }

        return addresses;
    }

    /**
     * Sends a Slack notification.
     */
    async sendSlackNotification() {
        if (!this.slackEndpoint || !this.slackChannel) {
            return;
        }

        const webhook = new IncomingWebhook(this.slackEndpoint);

        const data = {
            channel: this.slackChannel,
            text: `New ${this.replaceTags(this.formConfig.subject)}`
        };

        return webhook
            .send(data)
            .then(result => {
                console.log(`Slack notification sent.`, result);
            })
            .catch(err => console.log(err));
    }

    /**
     * Replaces simple tags in string with the value of a form field.
     * `Hello {name}` → `Hello Vince`
     */
    replaceTags(text) {
        this.filteredFormFields.forEach(field => {
            text = text.replace("{" + field.name + "}", field.value);
        });

        return text;
    }

    /**
     * Handler to be called after sending operations, with optional callback.
     */
    onFinished(callback) {
        this.sent = true;

        if (callback) {
            return callback();
        }

        return true;
    }

    /**
     * Builds the HTTP response object that'll be returned by the handler.
     */
    getResponse() {
        // return HTML for form posts, otherwise JSON
        const contentType =
            this.getContentType() === "application/x-www-form-urlencoded"
                ? "text/html"
                : "application/json";

        /**
         * set response content-type
         */
        this.response.headers["Content-Type"] = contentType;

        /**
         * set response code
         */
        const sent = this.didSend();
        const hasErrors = this.hasErrors();
        const failedSend = sent !== true;
        const invalidFormId =
            this.hasFormId() === true && this.hasValidForm() === false;
        const missingFormId =
            this.hasFormId() === false && this.payload !== false;
        const redirect = this.getPostSubmitRedirect();
        const emptyPost = this.hasFormId() === false && this.payload === false;

        if (emptyPost) {
            // default redirect
            this.response.statusCode = 302;
        } else if (hasErrors || failedSend || invalidFormId || missingFormId) {
            this.response.statusCode = 400;
        } else if (redirect) {
            this.response.statusCode = 302;
            this.response.headers.Location = redirect;
        } else {
            this.response.statusCode = 200;
        }

        if (!redirect && this.response.statusCode !== 302) {
            // remove any redirect Location if it's not a 301/302
            delete this.response.headers.Location;
        }

        /**
         * set response content
         */

        const isSuccess =
            this.response.statusCode === 200 ||
            this.response.statusCode === 302;
        const errors = this.getErrors();

        let reasons = [];

        if (hasErrors) {
            reasons.push(`Form has errors.`);
        }

        if (failedSend) {
            reasons.push(`Failed to send.`);
        }

        if (invalidFormId) {
            reasons.push(`Invalid form ID.`);
        }

        if (missingFormId) {
            reasons.push(`Missing form ID.`);
        }

        if (contentType === "application/json") {
            let body = {
                success: isSuccess,
                reason: reasons,
                errors: errors
            };

            if (body.reason.length === 0) {
                delete body.reason;
            }

            if (body.errors.length === 0) {
                delete body.errors;
            }

            this.response.body = JSON.stringify(body);
        } else {
            let heading = `Form Submitted!`;
            let back = false;

            if (!isSuccess) {
                back = true;

                if (errors.length === 1) {
                    heading = `Uh oh! There was a problem with the form.`;
                } else {
                    heading = `Uh oh! There were problems with the form.`;
                }
            }

            this.response.body = this.getResponseHtml(heading, errors, back);
        }

        return this.response;
    }

    /**
     * Builds the complete HTML response to be output in the browser.
     */
    getResponseHtml(heading, errors, displayBack) {
        const styles = require("fs").readFileSync(
            __dirname + "/../css/main.css",
            "utf-8"
        );
        const minifyOptions = {
            collapseWhitespace: true,
            removeComments: true,
            collapseInlineTagWhitespace: true,
            minifyCSS: true
        };

        return minify(
            `
            <!doctype html>
            <html lang="en">
            <head>
                <meta charset="utf-8">
                <title></title>
                <style>${styles}</style>
                <meta name="robots" content="noindex,nofollow">
            </head>
            <body>
                <div class="wrapper">
                    <div class="little-box">
                        ${this.getHeadingMarkup(heading)}
                        ${this.getErrorsMarkup(errors)}
                        ${this.getBackMarkup(displayBack)}
                    </div>
                </div>
            </body>
            </html>
            `,
            minifyOptions
        );
    }

    /**
     * Builds the heading part of the HTML response.
     */
    getHeadingMarkup(heading) {
        if (heading && heading.trim().length > 0) {
            return `<h1>${heading}</h1>`;
        }

        return ``;
    }

    /**
     * Builds the form error part of the HTML response.
     */
    getErrorsMarkup(errors) {
        if (errors && Object.keys(errors).length) {
            return `
            <ul>
            ${Object.values(errors).map(
                error => `
            <li>${error}</li>
            `
            )}
            </ul>
            `;
        }

        return ``;
    }

    /**
     * Builds the back link part of the HTML response.
     */
    getBackMarkup(back) {
        if (back) {
            return `
                <p class="mt-8 mb-0 text-center">
                    <a href="javascript:history.back()" class="btn">go back</a>
                </p>
            `;
        }

        return ``;
    }

    // sendWebhookPost() {

    // }

    // sendToDatabase() {

    // }

    /**
     * Adds the provided content into the body of an email notification template.
     */
    addContentToEmail(content) {
        const minifyOptions = {
            collapseWhitespace: true,
            removeComments: true,
            collapseInlineTagWhitespace: true,
            minifyCSS: true
        };

        return minify(
            `
            <!doctype html>
            <html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
            <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width">
                <meta http-equiv="X-UA-Compatible" content="IE=edge">
                <meta name="x-apple-disable-message-reformatting">
                <title></title>
            
                <!-- Web Font / @font-face : BEGIN -->
                <!-- NOTE: If web fonts are not required, lines 10 - 27 can be safely removed. -->
            
                <!-- Desktop Outlook chokes on web font references and defaults to Times New Roman, so we force a safe fallback font. -->
                <!--[if mso]>
                <style>
                    * {
                        font-family: sans-serif !important;
                    }
                </style>
                <![endif]-->
            
                <!-- All other clients get the webfont reference; some will render the font and others will silently fail to the fallbacks. More on that here: http://stylecampaign.com/blog/2015/02/webfont-support-in-email/ -->
                <!--[if !mso]><!-->
                <!-- insert web font reference, eg: <link href='https://fonts.googleapis.com/css?family=Roboto:400,700' rel='stylesheet' type='text/css'> -->
                <!--<![endif]-->
            
                <!-- Web Font / @font-face : END -->
            
                <!-- CSS Reset : BEGIN -->
                <style>
            
                    /* What it does: Remove spaces around the email design added by some email clients. */
                    /* Beware: It can remove the padding / margin and add a background color to the compose a reply window. */
                    html,
                    body {
                        margin: 0 auto !important;
                        padding: 0 !important;
                        height: 100% !important;
                        width: 100% !important;
                    }
            
                    /* What it does: Stops email clients resizing small text. */
                    * {
                        -ms-text-size-adjust: 100%;
                        -webkit-text-size-adjust: 100%;
                    }
            
                    /* What it does: Centers email on Android 4.4 */
                    div[style*="margin: 16px 0"] {
                        margin: 0 !important;
                    }
            
                    /* What it does: Stops Outlook from adding extra spacing to tables. */
                    table,
                    td {
                        mso-table-lspace: 0pt !important;
                        mso-table-rspace: 0pt !important;
                    }
            
                    /* What it does: Fixes webkit padding issue. Fix for Yahoo mail table alignment bug. Applies table-layout to the first 2 tables then removes for anything nested deeper. */
                    table {
                        border-spacing: 0 !important;
                        border-collapse: collapse !important;
                        table-layout: fixed !important;
                        margin: 0 auto !important;
                    }
                    table table table {
                        table-layout: auto;
                    }
            
                    /* What it does: Uses a better rendering method when resizing images in IE. */
                    img {
                        -ms-interpolation-mode:bicubic;
                    }
            
                    /* What it does: Prevents Windows 10 Mail from underlining links despite inline CSS. Styles for underlined links should be inline. */
                    a {
                        text-decoration: none;
                    }
            
                    hr {
                        height: 0;
                        border: 0;
                        border-top: 2px solid #eee;
                        color: #ddd;
                        background: #ddd;
                    }
            
                    table.content-table {
                        width: 100%;
                        margin-top: 35px;
                        margin-bottom: 25px;
                        border: 0;
                    }
            
                    table.content-table tbody td {
                        font-size: 14px;
                        border: 0;
                        border-top: 1px solid #eee;
                        width: auto;
                    }
            
                    table.content-table thead th {
                        font-size: 13px;
                        border-top: 0;
                        border-bottom: 0;
                    }
            
                    h1, h2, h3 {
                        font-family: -apple-system,BlinkMacSystemFont,Helvetica Neue,Helvetica,Arial,sans-serif;
                        color: #222;
                    }
            
                    h3 {
                        margin-top: 32px;
                        margin-bottom: 0px;
                    }
            
                    table {
                        font-family: -apple-system,BlinkMacSystemFont,Helvetica Neue,Helvetica,Arial,sans-serif;
                    }
            
                    body, p {
                        font-family: -apple-system,BlinkMacSystemFont,Helvetica Neue,Helvetica,Arial,sans-serif;
                        color: #555;
                    }
            
                    .muted {
                        color: #999;
                    }
            
                    .mono {
                        font-family: monospace;
                        font-size: 11px;
                    }
            
                    .small {
                        font-size: 12px;
                    }
            
                    .no-margin {
                        margin: 0;
                    }
            
                    .no-left-margin {
                        margin-left: 0;
                    }
            
                    .no-left-padding {
                        padding-left: 0;
                    }
            
                    .no-right-margin {
                        margin-right: 0;
                    }
            
                    .no-right-padding {
                        padding-right: 0;
                    }
            
                    .normal-cell-padding {
                        padding: 5px 10px;
                    }
            
                    .first-cell-padding {
                        padding: 5px 10px 5px 0px;
                    }
            
                    .last-cell-padding {
                        padding: 5px 0px 5px 10px;
                    }
            
                    .align-left {
                        text-align: left;
                    }
            
                    .align-right {
                        text-align: right;
                    }
            
                    .no-top-margin {
                        margin-top: 0;
                    }
            
                    .primary-detail {
                        color: #333333;
                    }
            
                    .large-bottom-margin {
                        margin-bottom: 35px;
                    }
            
                    .nowrap {
                        white-space: nowrap;
                        border-collapse: collapse !important;
                    }
            
                    /* What it does: A work-around for email clients meddling in triggered links. */
                    *[x-apple-data-detectors],  /* iOS */
                    .unstyle-auto-detected-links *,
                    .aBn {
                        border-bottom: 0 !important;
                        cursor: default !important;
                        color: inherit !important;
                        text-decoration: none !important;
                        font-size: inherit !important;
                        font-family: inherit !important;
                        font-weight: inherit !important;
                        line-height: inherit !important;
                    }
            
                    /* What it does: Prevents Gmail from displaying a download button on large, non-linked images. */
                    .a6S {
                        display: none !important;
                        opacity: 0.01 !important;
                    }
            
                    /* What it does: Prevents Gmail from changing the text color in conversation threads. */
                    .im {
                        color: inherit !important;
                    }
            
                    /* If the above doesn't work, add a .g-img class to any image in question. */
                    img.g-img + div {
                        display: none !important;
                    }
            
                    /* What it does: Removes right gutter in Gmail iOS app: https://github.com/TedGoas/Cerberus/issues/89  */
                    /* Create one of these media queries for each additional viewport size you'd like to fix */
            
                    /* iPhone 4, 4S, 5, 5S, 5C, and 5SE */
                    @media only screen and (min-device-width: 320px) and (max-device-width: 374px) {
                        u ~ div .email-container {
                            min-width: 320px !important;
                        }
                    }
                    /* iPhone 6, 6S, 7, 8, and X */
                    @media only screen and (min-device-width: 375px) and (max-device-width: 413px) {
                        u ~ div .email-container {
                            min-width: 375px !important;
                        }
                    }
                    /* iPhone 6+, 7+, and 8+ */
                    @media only screen and (min-device-width: 414px) {
                        u ~ div .email-container {
                            min-width: 414px !important;
                        }
                    }
            
                </style>
                <!-- CSS Reset : END -->
                <!-- Reset list spacing because Outlook ignores much of our inline CSS. -->
                <!--[if mso]>
                <style type="text/css">
                    ul,
                    ol {
                        margin: 0 !important;
                    }
                    li {
                        margin-left: 30px !important;
                    }
                    li.list-item-first {
                        margin-top: 0 !important;
                    }
                    li.list-item-last {
                        margin-bottom: 10px !important;
                    }
                </style>
                <![endif]-->
            
                <!-- Progressive Enhancements : BEGIN -->
                <style>
                    .button-td,
                    .button-a {
                        transition: all 100ms ease-in;
                    }
                    .button-td-primary:hover,
                    .button-a-primary:hover {
                        background: #555555 !important;
                        border-color: #555555 !important;
                    }
            
                    @media screen and (max-width: 600px) {
                        .email-container p {
                            font-size: 17px !important;
                        }
                    }
                </style>
                <!-- Progressive Enhancements : END -->
                <!--[if gte mso 9]>
                <xml>
                    <o:OfficeDocumentSettings>
                        <o:AllowPNG/>
                        <o:PixelsPerInch>96</o:PixelsPerInch>
                    </o:OfficeDocumentSettings>
                </xml>
                <![endif]-->
            </head>
            <body width="100%" style="margin: 0; padding: 0 !important; mso-line-height-rule: exactly; background-color: #eeeeee;" bgcolor="#eeeeee">
            <center style="width: 100%; background-color: #eeeeee;">
                <!--[if mso | IE]>
                <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #222222;">
                    <tr>
                        <td>
                <![endif]-->
                <div style="max-width: 600px; margin: 0 auto;" class="email-container">
                    <!--[if mso]>
                    <table align="center" role="presentation" cellspacing="0" cellpadding="0" border="0" width="600">
                        <tr>
                            <td>
                    <![endif]-->
                    <!-- Email Body : BEGIN -->
                    <table align="center" role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 0 auto;">
                        <tr>
                            <td style="background-color: #ffffff;">
                                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                                    <tr>
                                        <td style="padding: 20px; font-family: sans-serif; font-size: 15px; line-height: 20px; color: #555555;">
                                            ${content}
                                        </td>
                                    </tr>
                                </table>
                            </td>
                        </tr>
                    </table>
                    <!--[if mso]>
                    </td>
                    </tr>
                    </table>
                    <![endif]-->
                </div>
            </center>
            </body>
            </html>`,
            minifyOptions
        );
    }
}

module.exports = FormHandler;
