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

    const extras = new AWS.Extras({
      credentials: this.credentials.aws,
      region: this.state.region
    })

    const outputs = await extras.deployStack(inputs)

    this.state.stackName = inputs.stackName

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

    await extras.removeStack({ stackName: this.state.stackName })
  }
}

module.exports = CloudFormation
