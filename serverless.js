const { Component } = require('@serverless/core')
const { equals, isEmpty, isNil, mergeDeepRight, not } = require('ramda')

const {
  constructTemplateS3Key,
  createOrUpdateStack,
  deleteBucket,
  deleteStack,
  fetchOutputs,
  getClients,
  getPreviousStack,
  uploadTemplate,
  updateTerminationProtection
} = require('./utils')

const defaults = {
  enableTerminationProtection: false,
  parameters: {},
  region: 'us-east-1',
  rollbackConfiguration: {}
}

class AwsCloudFormation extends Component {
  async default(inputs = {}) {
    this.context.status('Deploying')
    const config = mergeDeepRight(defaults, inputs)
    config.externalBucket = not(isNil(config.bucket))
    config.bucket = this.state.bucket || config.bucket
    config.timestamp = Date.now()

    config.templateS3Key = constructTemplateS3Key(config)

    if (isNil(config.bucket)) {
      const awsS3 = await this.load('@serverless/aws-s3')
      this.context.debug('Creating S3 bucket for the template.')
      const { name } = await awsS3()
      config.bucket = name
    }

    const { cloudformation, s3 } = getClients(this.context.credentials.aws, config.region)

    if (not(isNil(this.state.stackName)) && not(equals(this.state.stackName, config.stackName))) {
      this.context.debug(
        `Delete stack ${this.state.stackName} prior to creation of ${config.stackName}.`
      )
      await deleteStack(cloudformation, this.state)
    }

    let stackOutputs = {}
    const previousStack = await getPreviousStack(cloudformation, config)
    if (previousStack.needsUpdate) {
      this.context.debug(
        `Uploading template ${config.templateS3Key} to S3 bucket ${config.bucket}.`
      )
      await uploadTemplate(s3, config)
      this.context.debug(`Deploying stack ${config.stackName}.`)
      stackOutputs = await createOrUpdateStack(
        cloudformation,
        config,
        not(isEmpty(previousStack.stack))
      )
    } else {
      this.context.debug(`Fetching stack outputs from stack ${config.stackName}.`)
      stackOutputs = await fetchOutputs(cloudformation, config)
    }

    this.context.debug(`Update termination protection.`)
    await updateTerminationProtection(
      cloudformation,
      config,
      !!previousStack.stack.EnableTerminationProtection
    )

    this.state = {
      bucket: config.bucket,
      externalBucket: config.externalBucket,
      region: config.region,
      stackName: config.stackName
    }
    await this.save()
    return stackOutputs
  }

  async remove() {
    this.context.status('Removing')
    if (!this.state.stackName) {
      this.context.debug(`Aborting removal. Stack name not found in state.`)
      return
    }
    const { cloudformation, s3 } = getClients(this.context.credentials.aws, this.state.region)
    this.context.debug(`Deleting stack ${this.state.stackName}.`)
    const promises = [deleteStack(cloudformation, this.state)]
    if (not(this.state.externalBucket)) {
      this.context.debug(`Deleting bucket ${this.state.bucket}.`)
      promises.push(deleteBucket(s3, this.state))
    }
    await Promise.all(promises)
    this.state = {}
    await this.save()
    return {}
  }
}

module.exports = AwsCloudFormation
