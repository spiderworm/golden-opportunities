// The endpoint's web application firewall (AWS WAF), in front of its
// CloudFront distribution (stack.ts). WAF for CloudFront lives in us-east-1,
// so it's a stack of its own there:
//   node src/ingest/waf.ts > waf.json
//   aws cloudformation deploy --region us-east-1 --stack-name tellim-analytics-waf --template-file waf.json
// Its WebAclArn output is stack.ts's WebAclArn parameter. About $7 a month
// (the ACL and its two rules), plus $0.60 a million requests.
export const waf = {
  AWSTemplateFormatVersion: "2010-09-09",
  Description: "Tellim Games analytics: per-address rate limit and body size limit for the ingest endpoint",
  Resources: {
    Acl: {
      Type: "AWS::WAFv2::WebACL",
      Properties: {
        Name: "tellim-analytics",
        Scope: "CLOUDFRONT",
        DefaultAction: { Allow: {} },
        VisibilityConfig: { SampledRequestsEnabled: true, CloudWatchMetricsEnabled: true, MetricName: "tellim-analytics" },
        Rules: [
          {
            // a game sends a batch a minute, and a backlog after time offline
            // in a quick run of them: 300 in five minutes is far beyond either
            Name: "rate-per-address",
            Priority: 0,
            Action: { Block: {} },
            Statement: { RateBasedStatement: { Limit: 300, EvaluationWindowSec: 300, AggregateKeyType: "IP" } },
            VisibilityConfig: { SampledRequestsEnabled: true, CloudWatchMetricsEnabled: true, MetricName: "rate-per-address" },
          },
          {
            // the client sends under 12 KB; anything over 16 KB (CloudFront's
            // inspection limit, so oversize counts as over) never reaches the Lambda
            Name: "body-size",
            Priority: 1,
            Action: { Block: {} },
            Statement: {
              SizeConstraintStatement: { FieldToMatch: { Body: { OversizeHandling: "MATCH" } }, ComparisonOperator: "GT", Size: 16384, TextTransformations: [{ Priority: 0, Type: "NONE" }] },
            },
            VisibilityConfig: { SampledRequestsEnabled: true, CloudWatchMetricsEnabled: true, MetricName: "body-size" },
          },
        ],
      },
    },
  },
  Outputs: { WebAclArn: { Value: { "Fn::GetAtt": ["Acl", "Arn"] } } },
};

if (import.meta.main) console.log(JSON.stringify(waf, null, 2));
