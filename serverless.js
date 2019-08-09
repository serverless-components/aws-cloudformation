const { Component } = require('@serverless/core')
const { isNil, merge, mergeDeepRight, not } = require('ramda')

const {
  needsUpdate,
  getClients,
  fetchOutputs,
  constructTemplateS3Key,
  createOrUpdateStack,
  uploadTemplate
} = require('./utils')

const defaults = {
  region: 'us-east-1'
}

class AwsCloudFormation extends Component {
  async default(inputs = {}) {
    this.context.status(`Deploying`)
    const config = mergeDeepRight(defaults, inputs)
    config.externalBucket = not(isNil(config.bucket))
    config.bucket = this.state.bucket || config.bucket
    config.timestamp = Date.now()

    config.templateS3Key = constructTemplateS3Key(config)

    if (isNil(config.bucket)) {
      const awsS3 = await this.load('@serverless/aws-s3')
      const { name } = await awsS3()
      config.bucket = name
    }

    const { cloudformation, s3 } = getClients()

    let stackOutputs = {}
    if (await needsUpdate(cloudformation, config)) {
      await uploadTemplate(s3, config)
      stackOutputs = await createOrUpdateStack(cloudformation, config)
    } else {
      stackOutputs = await fetchOutputs(cloudformation, config)
    }

    this.state = {
      bucket: config.bucket,
      externalBucket: config.externalBucket,
      region: config.region
    }
    await this.save()
    return stackOutputs
  }

  async remove(inputs = {}) {
    console.log('remove', inputs)
    await deleteStack()
    if (not(this.state.externalBucket)) {
      // delete bucket
    }
    this.state = {}
    await this.save()
    return {}
  }
}

module.exports = AwsCloudFormation
