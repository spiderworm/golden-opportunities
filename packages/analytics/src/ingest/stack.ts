// The endpoint's AWS stack (CloudFormation), with handler.cjs and edge.js inlined:
//   node src/ingest/stack.ts > stack.json
//   aws cloudformation deploy --region us-west-1 --stack-name tellim-analytics \
//     --template-file stack.json --capabilities CAPABILITY_IAM \
//     --parameter-overrides Games=waddleberg WebAclArn=<waf.ts's stack's output>
// The stack's EndpointUrl output is what a game passes as createAnalytics' endpoint.
// A game is added by adding its name to Games and deploying again.
//
// Hardened (David, 22 Oct 2026, on Cube's asking: a public function URL that
// writes could be flooded): the function answers only CloudFront, which signs
// each request to it (an origin access control); the edge function (edge.js)
// and the firewall (waf.ts) stop anything but a signed POST under 16 KB, and
// more than 300 requests in five minutes from one address; and at most 3 run
// at once, a ceiling on cost (the client keeps a refused batch and sends it later).
// Its logs are Lambda's own lines only, kept 14 days.
import { readFileSync } from "node:fs";

const code = readFileSync(new URL("./handler.cjs", import.meta.url), "utf8");
if (code.length > 4096) throw new Error(`handler.cjs is ${code.length} bytes; CloudFormation inlines at most 4096`);
const edge = readFileSync(new URL("./edge.js", import.meta.url), "utf8");

// CloudFront's managed policies
const CACHING_DISABLED = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad";
const ALL_VIEWER_EXCEPT_HOST = "b689b0a8-53d0-40ab-baf2-68738e2966ac"; // a function URL wants its own Host
const distributionArn = { "Fn::Sub": "arn:aws:cloudfront::${AWS::AccountId}:distribution/${Distribution}" };

export const stack = {
  AWSTemplateFormatVersion: "2010-09-09",
  Description: "Tellim Games analytics: a function URL that keeps games' event batches in a private bucket",
  Parameters: {
    Games: { Type: "String", Description: "the games the endpoint takes, comma-separated" },
    WebAclArn: { Type: "String", Description: "the firewall's ARN (waf.ts, us-east-1)" },
  },
  Resources: {
    Bucket: {
      Type: "AWS::S3::Bucket",
      DeletionPolicy: "Retain",
      Properties: {
        PublicAccessBlockConfiguration: { BlockPublicAcls: true, BlockPublicPolicy: true, IgnorePublicAcls: true, RestrictPublicBuckets: true },
        OwnershipControls: { Rules: [{ ObjectOwnership: "BucketOwnerEnforced" }] },
        BucketEncryption: { ServerSideEncryptionConfiguration: [{ ServerSideEncryptionByDefault: { SSEAlgorithm: "AES256" } }] },
        // the games' privacy policies say play data is deleted after two years
        LifecycleConfiguration: { Rules: [{ Id: "two-years", Status: "Enabled", Prefix: "events/", ExpirationInDays: 730 }] },
      },
    },
    Role: {
      Type: "AWS::IAM::Role",
      Properties: {
        AssumeRolePolicyDocument: { Version: "2012-10-17", Statement: [{ Effect: "Allow", Principal: { Service: "lambda.amazonaws.com" }, Action: "sts:AssumeRole" }] },
        Policies: [
          {
            PolicyName: "put-events",
            PolicyDocument: {
              Version: "2012-10-17",
              Statement: [
                { Effect: "Allow", Action: "s3:PutObject", Resource: { "Fn::Sub": "${Bucket.Arn}/events/*" } },
                // the build → version table (handler.cjs), written by the analytics app's deploy
                { Effect: "Allow", Action: "s3:GetObject", Resource: { "Fn::Sub": "${Bucket.Arn}/config/versions.json" } },
              ],
            },
          },
          {
            PolicyName: "own-logs",
            PolicyDocument: { Version: "2012-10-17", Statement: [{ Effect: "Allow", Action: ["logs:CreateLogStream", "logs:PutLogEvents"], Resource: { "Fn::Sub": "${Logs.Arn}" } }] },
          },
        ],
      },
    },
    // Lambda's own lines only (each request's duration, cold-start time, errors): the
    // handler logs nothing, so no play data or addresses (David, 27 Oct 2026: cold
    // starts were timing out and there was nothing to measure them with)
    Logs: { Type: "AWS::Logs::LogGroup", Properties: { LogGroupName: "/tellim/analytics-ingest", RetentionInDays: 14 } },
    Function: {
      Type: "AWS::Lambda::Function",
      Properties: {
        Runtime: "nodejs22.x",
        Handler: "index.handler",
        // 512 MB: Lambda's CPU grows with memory, and at 128 MB a cold start (loading
        // the S3 SDK) ran past 5 s, so a phone's first batch after a quiet spell timed
        // out (27 Oct 2026). 10 s is the margin.
        MemorySize: 512,
        Timeout: 10,
        LoggingConfig: { LogGroup: { Ref: "Logs" }, LogFormat: "Text" },
        ReservedConcurrentExecutions: 3,
        Role: { "Fn::GetAtt": ["Role", "Arn"] },
        Environment: { Variables: { BUCKET: { Ref: "Bucket" }, GAMES: { Ref: "Games" } } },
        Code: { ZipFile: code },
      },
    },
    Url: {
      Type: "AWS::Lambda::Url",
      Properties: {
        TargetFunctionArn: { "Fn::GetAtt": ["Function", "Arn"] },
        AuthType: "AWS_IAM", // CloudFront only: no CORS here, the edge and CloudFront answer it
      },
    },
    // a function URL needs InvokeFunction as well as InvokeFunctionUrl (since
    // October 2025): without it every request was 403 (22 Oct 2026)
    UrlPermission: {
      Type: "AWS::Lambda::Permission",
      Properties: { Action: "lambda:InvokeFunctionUrl", FunctionName: { Ref: "Function" }, Principal: "cloudfront.amazonaws.com", SourceArn: distributionArn, FunctionUrlAuthType: "AWS_IAM" },
    },
    InvokePermission: {
      Type: "AWS::Lambda::Permission",
      Properties: { Action: "lambda:InvokeFunction", FunctionName: { Ref: "Function" }, Principal: "cloudfront.amazonaws.com", SourceArn: distributionArn },
    },
    OriginAccess: {
      Type: "AWS::CloudFront::OriginAccessControl",
      Properties: {
        OriginAccessControlConfig: { Name: "tellim-analytics", OriginAccessControlOriginType: "lambda", SigningBehavior: "always", SigningProtocol: "sigv4" },
      },
    },
    Edge: {
      Type: "AWS::CloudFront::Function",
      Properties: {
        Name: "tellim-analytics",
        AutoPublish: true,
        FunctionConfig: { Comment: "signed POSTs only; answers the preflight", Runtime: "cloudfront-js-2.0" },
        FunctionCode: edge,
      },
    },
    // CORS on the function's answers: the managed SimpleCORS added nothing, the
    // signed POST (with its x-amz-content-sha256) not being a simple request
    // (22 Oct 2026), and a browser refuses an answer without it, so the client
    // would send the batch again and again
    Cors: {
      Type: "AWS::CloudFront::ResponseHeadersPolicy",
      Properties: {
        ResponseHeadersPolicyConfig: {
          Name: "tellim-analytics",
          CorsConfig: {
            AccessControlAllowOrigins: { Items: ["*"] },
            AccessControlAllowMethods: { Items: ["POST"] },
            AccessControlAllowHeaders: { Items: ["content-type", "x-amz-content-sha256"] },
            AccessControlAllowCredentials: false,
            AccessControlMaxAgeSec: 86400,
            OriginOverride: true,
          },
        },
      },
    },
    Distribution: {
      Type: "AWS::CloudFront::Distribution",
      Properties: {
        DistributionConfig: {
          Comment: "tellim-analytics",
          Enabled: true,
          HttpVersion: "http2and3",
          PriceClass: "PriceClass_100",
          WebACLId: { Ref: "WebAclArn" },
          Origins: [
            {
              Id: "ingest",
              DomainName: { "Fn::Select": [2, { "Fn::Split": ["/", { "Fn::GetAtt": ["Url", "FunctionUrl"] }] }] },
              OriginAccessControlId: { "Fn::GetAtt": ["OriginAccess", "Id"] },
              CustomOriginConfig: { OriginProtocolPolicy: "https-only", OriginSSLProtocols: ["TLSv1.2"] },
            },
          ],
          DefaultCacheBehavior: {
            TargetOriginId: "ingest",
            ViewerProtocolPolicy: "https-only",
            AllowedMethods: ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"], // CloudFront's only set with POST; the edge lets POST alone through
            CachedMethods: ["GET", "HEAD"],
            CachePolicyId: CACHING_DISABLED,
            OriginRequestPolicyId: ALL_VIEWER_EXCEPT_HOST,
            ResponseHeadersPolicyId: { Ref: "Cors" },
            FunctionAssociations: [{ EventType: "viewer-request", FunctionARN: { "Fn::GetAtt": ["Edge", "FunctionMetadata.FunctionARN"] } }],
          },
        },
      },
    },
  },
  Outputs: {
    EndpointUrl: { Value: { "Fn::Sub": "https://${Distribution.DomainName}/" } },
    BucketName: { Value: { Ref: "Bucket" } },
  },
};

if (import.meta.main) console.log(JSON.stringify(stack, null, 2));
