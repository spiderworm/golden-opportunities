// Where the studio's endpoint is: the tellim-analytics stack (stack.ts) in
// account 179223341424, deployed 22 Oct 2026. Every game sends to the one URL,
// CloudFront's since the hardening (the function URL answers only CloudFront).
export const deployed = {
  region: "us-west-1",
  stack: "tellim-analytics",
  endpoint: "https://d2lp7nqj3plxvw.cloudfront.net/",
  waf: { region: "us-east-1", stack: "tellim-analytics-waf" },
  bucket: "tellim-analytics-bucket-a5p3xk6k8ahw",
};
