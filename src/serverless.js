const { Component } = require('@serverless/core')
const { equals, is, isEmpty, isNil, mergeDeepRight, not } = require('ramda')

const {
  createOrUpdateStack,
  deleteStack,
  getClients,
  getStack,
  updateTerminationProtection
} = require('./utils')

const defaults = {
  enableTerminationProtection: false,
  parameters: {},
  region: 'us-east-1',
  role: undefined,
  rollbackConfiguration: {},
  disableRollback: false,
  capabilities: []
}

class AwsCloudFormation extends Component {
  async deploy(inputs = {}) {
    await this.status('Deploying')

    const config = mergeDeepRight(defaults, inputs)
    config.bucket = this.state.bucket || config.bucket
    config.timestamp = Date.now()

    if (isNil(config.template) || isNil(config.stackName)) {
      throw new Error('Invalid inputs; template and stackName are required.')
    }

    const { cloudformation } = getClients(this.credentials.aws, config.region)

    let previousStack = await getStack(cloudformation, config)

    await this.debug(`Deploying stack ${config.stackName}`)
    let stack = await createOrUpdateStack(
      cloudformation,
      config,
      previousStack,
    )

    await this.debug(`Updating termination protection`)
    await updateTerminationProtection(
      cloudformation,
      config,
      !!stack.EnableTerminationProtection
    )

    if (this.state.stackName && this.state.stackName !== config.stackName) {
      throw new Error(`Stack name cannot be changed (or Cloudformation will delete your existing one).  Please run 'remove', change your stack name, then deploy again.`)
    }

    this.state = {
      region: config.region,
      stackName: config.stackName
    }
    await this.save()

    stack = await getStack(cloudformation, config)

    return stack
  }

  async remove() {
    await this.status('Removing')
    if (!this.state.stackName) {
      await this.debug(`Aborting removal. Stack name not found in state.`)
      return
    }
    const { cloudformation } = getClients(this.credentials.aws, this.state.region)
    await this.debug(`Deleting stack ${this.state.stackName}.`)
    await deleteStack(cloudformation, this.state)
    this.state = {}
    await this.save()
    return {}
  }
}

module.exports = AwsCloudFormation
