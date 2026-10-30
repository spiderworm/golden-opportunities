// The endpoint's door at CloudFront's edge (a CloudFront Function, viewer
// request; stack.ts): answers the browser's CORS preflight itself, and lets
// through only a POST to / with its body's SHA-256, which CloudFront's
// signature to the Lambda needs. Anything else stops here, before the
// Lambda is invoked. (cloudfront-js-2.0: no imports, no exports.)
function handler(event) {
  var r = event.request;
  if (r.method === "OPTIONS")
    return {
      statusCode: 204,
      statusDescription: "No Content",
      headers: {
        "access-control-allow-origin": { value: "*" },
        "access-control-allow-methods": { value: "POST" },
        "access-control-allow-headers": { value: "content-type,x-amz-content-sha256" },
        "access-control-max-age": { value: "86400" },
      },
    };
  if (r.method !== "POST" || r.uri !== "/") return { statusCode: 405, statusDescription: "Method Not Allowed" };
  var h = r.headers["x-amz-content-sha256"];
  if (!h || !/^[0-9a-f]{64}$/.test(h.value)) return { statusCode: 400, statusDescription: "Bad Request" };
  return r;
}
