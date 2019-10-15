# Serverless Form Handler

[![serverless](http://public.serverless.com/badges/v3.svg)](http://www.serverless.com)

Lambda function to be easily tailored and deployed with the [Serverless framework](https://serverless.com/). Features:

-   Simple validation for required fields and honeypot for catching garbage.
-   Mailgun and Slack notifications.
-   Decent-looking HTML email and response templates that are easy to customize.
-   Keeps `to:` address(es) private with predefined form details.
-   JSON or HTML responses + support for redirects on success.
-   Can collect browser and OS details for support issues.
-   Built-in tests with [Jest](https://jestjs.io).

## Setup

First, check out the project and install its depenencies with `npm install`.

Configure serverless.yml if you'll be using Serverless.

1. Set `org` with whatever handle you're using.
2. Choose your AWS region if you don't want `us-west-2`.
3. Populate the environment variables.

```yml
environment:
    MAILGUN_API_KEY: #your key, starting with `key-`
    MAILGUN_DOMAIN: # your domain
    SLACK_CHANNEL: # channel name including #
    SLACK_ENDPOINT: # incoming webhook endpoint
    SITE_NAME: # friendly name, like `Working Concept`
    ROOT_REDIRECT: # URL to which bare endpoint access will be re-routed
    ALLOWED_ORIGINS: # comma-separated list of allowed origins (`https://workingconcept.com,localhost:8000`)
```

## Configuring Forms

Edit the array in `config/forms.js` to define each endpoint and the available fields. A simple contact form might look like this:

```json
(module.exports = {
    "contact": {
        "label": "Contact Form",
        "to": "hello@workingconcept.com",
        "from": "{email}",
        "subject": "Contact Form from {name}",
        "fields": {
            "name": {
                "label": "Name",
                "required": true
            },
            "email": {
                "label": "Email",
                "required": true
            },
            "message": {
                "label": "Message",
                "required": true
            },
            "fax": {
                "label": "Fax Number",
                "honeypot": true
            }
        }
    }
})
```

The `from` and `subject` values can use special placeholders `{var}`, where `var` will be substituted with the value of a submitted field name.

Each field needs to have its key correspond to the name of a submitted form field, and a friendly label for validation messages and success notifications. In addition to the label, optional properties are...

-   `required` which can be set to `true` to reject empty values
-   `honeypot` which can be `true` to have any _non-empty_ value keep the form from being submitted
-   `method` set to either `getIpAddress` or `getSystemDetails` to return the submitter's IP address or browser+OS based on details from the request (don't add form fields for these!)

A straightforward HTML form might then look like this:

```html
<form action="https://foo.dev/form/contact" method="post">
    <input type="hidden" name="redirect" value="https://foo.dev/success" />
    <input type="text" name="name" value="" required />
    <input type="email" name="email" value="" required />
    <textarea name="message" required></textarea>
    <input type="text" name="fax" value="" style="display: none;" />
    <button>Submit</button>
</form>
```

The form name must be provided, either in the URL (`/form/contact`) or in a `form` parameter (`<input type="hidden" name="form" value="contact" />`).

## Responses

### HTML

If your form request is submitted directly by the visitor in a browser (`application/x-www-form-urlencoded`), success/error messaging will be displayed as markup and successful posts will redirect if you've supplied a `redirect` field with the form.

### JSON

If you're submitting the data via AJAX as `application/json`, errors will return a 400 response with details or a 200 response if everything went well. The response data will always return a `success` property with a value of either `true` or `false`. If there are problems, there will also be `reason` and `errors` properties.

#### Error Example

400

```json
{
    "success": false,
    "reason": ["Form has errors.", "Failed to send."],
    "errors": {
        "email": ["Email is required."]
    }
}
```

#### Success Example

200

```json
{
    "success": true,
    "errors": {}
}
```

## Testing

`npm run test` and you should see something like this:

```shell
➜ npm run test

> form-handler@1.0.0 test /path/to/serverless-form-handler
> jest

 PASS  tests/api.test.js
  ✓ root redirects (130ms)
  ✓ valid submission redirects (1ms)
  ✓ valid form submission redirects (18ms)
  ✓ valid submission returns success
  ✓ valid form submission displays success (10ms)
  ✓ valid form submission redirects (5ms)
  ✓ invalid submission returns error (3ms)
  ✓ invalid form submission displays error (6ms)
  ✓ invalid form ID displays error (1ms)
  ✓ missing form ID displays error
  ✓ path-based form ID works (1ms)
  ✓ filled honeypot displays error
  ✓ empty honeypot succeeds (1ms)

Test Suites: 1 passed, 1 total
Tests:       13 passed, 13 total
Snapshots:   0 total
Time:        1.652s
Ran all test suites.
```

## Deploying

There are two environments, `dev` and `prod`. Deploying without an argument defaults to `dev`:

```
serverless deploy
```

That's the same as running

```
serverless deploy --stage dev
```

To deploy to production, you'd specify `prod` instead:

```
serverless deploy --stage prod
```

If you'd like to set up a custom domain in the AWS API gateway, this article will help: https://medium.com/@maciejtreder/custom-domain-in-aws-api-gateway-a2b7feaf9c74

---

## Support

No guarantees, but [submit an issue](https://github.com/workingconcept/serverless-form-handler/issues) I'll try and do my best to help as I have time!

## Contributing

I'm new to Lambda functions, serverless architecture and even working more closely with JavaScript and I'd appreciate any feedback or pull requests.
