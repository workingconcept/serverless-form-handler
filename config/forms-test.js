module.exports = {
    intake: {
        label: `Project Brief`,
        to: `hello@foo.dev`,
        from: `{email}`,
        subject: `Project Brief from {name}`,
        fields: {
            name: {
                label: `Name`,
                required: true
            },
            email: {
                label: `Email`,
                required: true
            },
            company: {
                label: `Company`,
                required: true
            },
            phone: {
                label: `Phone`
            },
            website: {
                label: `Website`
            },
            budget: {
                label: `Approximate Budget`,
                required: true
            },
            start: {
                label: `Ideal Start Date`,
                required: true
            },
            description: {
                label: `Project Description`,
                required: true
            }
        }
    },
    support: {
        label: `Support Request`,
        to: `hello@foo.dev`,
        from: `{email}`,
        subject: `Support Request from {name}`,
        fields: {
            name: {
                label: `Name`,
                required: true
            },
            email: {
                label: `Email`,
                required: true
            },
            project: {
                label: `Project`,
                required: true
            },
            phone: {
                label: `Phone`
            },
            priority: {
                label: `Priority`
            },
            description: {
                label: `Description`,
                required: true
            },
            ip_address: {
                label: `IP Address`,
                method: `getIpAddress`
            },
            system: {
                label: `System`,
                method: `getSystemDetails`
            }
        }
    },
    contact: {
        label: `Contact Form`,
        to: `hello@foo.dev`,
        from: `{email}`,
        subject: `Contact Form from {name}`,
        fields: {
            name: {
                label: `Name`,
                required: true
            },
            email: {
                label: `Email`,
                required: true
            },
            message: {
                label: `Message`,
                required: true
            },
            fax: {
                label: `Fax Number`,
                honeypot: true
            }
        }
    }
};
