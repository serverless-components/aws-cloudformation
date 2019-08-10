# AWS Cloudformation

Easily Deploy Cloudformation templates on AWS using [Serverless Components](https://github.com/serverless/components).

&nbsp;

- [AWS Cloudformation](#aws-cloudformation)
    - [1. Install](#1-install)
    - [2. Create](#2-create)
    - [3. Configure](#3-configure)
    - [4. Deploy](#4-deploy)
    - [New to Components?](#new-to-components)

&nbsp;


### 1. Install

```console
$ npm install -g serverless
```

### 2. Create

Just create a `serverless.yml` file

```shell
$ touch serverless.yml
$ touch .env      # your development AWS api keys
$ touch .env.prod # your production AWS api keys
```

the `.env` files are not required if you have the aws keys set globally and you want to use a single stage, but they should look like this.

```
AWS_ACCESS_KEY_ID=XXX
AWS_SECRET_ACCESS_KEY=XXX
```

### 3. Configure

```yml
# serverless.yml

name: my-service
stage: dev

myStack:
  component: '@serverless/aws-cloudformation'
  inputs:
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
- `stackName` **[required]**. the name of the stack
- `template` **[required]**, the template to deploy, can also be a local path to the template, e.g. `./my-template.yml`
- `bucket`, the deployment bucket where the template is stored before deployment. If not set a new bucket will be created.
- `capabilities`, possible values are `CAPABILITY_IAM`, `CAPABILITY_NAMED_IAM`, and `CAPABILITY_AUTO_EXPAND`.
- `enableTerminationProtection`, possible values are `true` and `false`. Default is `false`.
- `rollbackConfiguration`, see [RollbackConfiguration](https://docs.aws.amazon.com/AWSCloudFormation/latest/APIReference/API_RollbackConfiguration.html)
- `role`, role arn for the role which CloudFormation assumes to create the stack.

See [Request Parameters](https://docs.aws.amazon.com/AWSCloudFormation/latest/APIReference/API_CreateStack.html#API_CreateStack_RequestParameters) for more info about capabilities, enableTerminationProtection, and role.

### 4. Deploy

```console
$ serverless
```

### New to Components?

Checkout the [Serverless Components](https://github.com/serverless/components) repo for more information.
