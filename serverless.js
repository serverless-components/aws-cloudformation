const { Component } = require('@serverless/core')
const { isNil, mergeDeepRight } = require('ramda')

const { getClients, createOrUpdateStack } = require('./utils')

const defaults = {
  region: 'us-east-1'
}

class AwsCloudFormation extends Component {
  async default(inputs = {}) {
    this.context.status(`Deploying`)

    const config = mergeDeepRight(defaults, inputs)
    config.bucket = this.state.bucket || config.bucket

    if (isNil(config.bucket)) {
      const awsS3 = await this.load('@serverless/aws-s3')
      const { name } = await awsS3()
      config.bucket = name
    }

    const outputs = {
      bucket: config.bucket
    }

    const { cloudformation } = getClients()
    await createOrUpdateStack(cloudformation, config.bucket, inputs)

    this.state = outputs
    await this.save()

    return {}
  }

  async remove(inputs = {}) {
    console.log('remove', inputs)
    return {}
  }
}

module.exports = AwsCloudFormation
