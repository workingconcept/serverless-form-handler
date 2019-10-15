const forms = require("./config/forms.js");
const testForms = require("./config/forms-test.js");
const FormHandler = require("./src/js/FormHandler.js");

exports.handler = async (event, context) => {
    const testMode = process.env.TEST ? true : false;

    if (!testMode) {
        // console.log(
        //     "ENVIRONMENT VARIABLES\n" + JSON.stringify(process.env, null, 2)
        // );
        console.log("EVENT\n" + JSON.stringify(event, null, 2));
        // console.log("CONTEXT\n" + JSON.stringify(context, null, 2));
    }

    const formSettings = testMode ? testForms : forms;

    const handler = new FormHandler(event, formSettings, {
        mailgunDomain: process.env.MAILGUN_DOMAIN,
        mailgunKey: process.env.MAILGUN_API_KEY,
        defaultRedirect: process.env.ROOT_REDIRECT,
        slackChannel: process.env.SLACK_CHANNEL,
        slackEndpoint: process.env.SLACK_ENDPOINT,
        allowedOrigins: process.env.ALLOWED_ORIGINS
    });

    if (handler.hasValidForm()) {
        if (handler.validateFormFields()) {
            await handler.send();
        }
    }

    return handler.getResponse();
};
