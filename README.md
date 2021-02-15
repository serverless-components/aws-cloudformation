[![Serverless Components](https://s3.amazonaws.com/public.assets.serverless.com/images/readme_serverless_components.gif)](http://serverless.com)

<br/>

**AWS CloudFormation Component** ⎯⎯⎯ Easily Deploy AWS Cloudformation templates using [Serverless Components](https://github.com/serverless/components), and pass their outputs to other Serverless Components.

&nbsp;

1. [**Install**](#1-install)
2. [**Initialize**](#2-initialize)
3. [**Configure**](#3-configure)
4. [**Deploy**](#4-deploy)
5. [**Remove**](#5-remove)

&nbsp;

### 1. Install

```
npm install -g serverless
```

After installation, make sure you connect your AWS account by setting a provider in the org setting page on the [Serverless Dashboard](https://app.serverless.com).

### 2. Initialize

The easiest way to get started with by initializing the `aws-cloudformation-starter` template. You can do that by running the following command:

```
serverless init aws-cloudformation-starter
cd aws-cloudformation-starter
```

### 3. Configure

You can configure your component & CloudFormation stack by editing the `serverless.yml` file in the root of the initialized template:

```yml
name: aws-cloudformation-starter
component: aws-cloudformation

inputs:
  name: my-stack
  template:
    AWSTemplateFormatVersion: '2010-09-09'
    Description: Example stack 1
    Resources:
      LogGroup:
        Type: AWS::Logs::LogGroup
        Properties:
          LogGroupName: /log/group/one
          RetentionInDays: 14
    Outputs:
      LogGroupArn:
        Value:
          Fn::GetAtt:
            - LogGroup
            - Arn
```

Inputs can contain the following properties:

- `name` **[required]**. the name of the stack
- `template` **[required]**, the template to deploy.
- `capabilities`, possible values are `CAPABILITY_IAM`, `CAPABILITY_NAMED_IAM`, and `CAPABILITY_AUTO_EXPAND`.
- `enableTerminationProtection`, possible values are `true` and `false`. Default is `false`.
- `role`, role arn for the role which CloudFormation assumes to create the stack.

See [Request Parameters](https://docs.aws.amazon.com/AWSCloudFormation/latest/APIReference/API_CreateStack.html#API_CreateStack_RequestParameters) for more info about capabilities, enableTerminationProtection, and role.

### 4. Deploy

You can deploy your stack with the following command:

```
serverless deploy
```

Once that is done, you'll see your stack outputs in the CLI, which you could then reference in another component.

### 5. Remove

To remove your entire stack, just run:

```
serverless remove
```
