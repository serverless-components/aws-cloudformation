const { Component } = require('@serverless/core')
const AWS = require('@serverless/aws-sdk-extra')

class CloudFormation extends Component {
  /**
   * Deploy
   * @param {object} inputs
   */
  async deploy(inputs) {
    // Check credentials exist
    if (Object.keys(this.credentials.aws).length === 0) {
      const msg =
        'AWS Credentials not found. Make sure you have a .env file in the current working directory. - Docs: https://git.io/JvArp'
      throw new Error(msg)
    }

    this.state.region = inputs.region || 'us-east-1'

    inputs.name = inputs.name || this.name

    if (!inputs.name) {
      throw new Error(`The "name" input is missing.`)
    }

    const extras = new AWS.Extras({
      credentials: this.credentials.aws,
      region: this.state.region
    })

    const outputs = await extras.deployStack({ stackName: inputs.name, ...inputs })

    this.state.name = inputs.name

    return outputs
  }

  /**
   * Remove
   */
  async remove() {
    const extras = new AWS.Extras({
      credentials: this.credentials.aws,
      region: this.state.region
    })

    await extras.removeStack({ stackName: this.state.name })
  }
}

module.exports = CloudFormation
