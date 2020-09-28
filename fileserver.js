const { createServer } = require("http");

// Stores the objects that will handle the GET, PUT & DELETE methods
// Object is not inherited from anything, instead of creating with {}, which inherits methods and properties of Object.prototype
// These properties are such as .toString()
const methods = Object.create(null);

let server = createServer((request, response) => {
  // Returns the first value if not falsy, else, returns notAllowed
  // Handler is either notAllowed or it is from methods
  let handler = methods[request.method] || notAllowed;

  handler(request)
    // Catches the error if there Promise is rejected. If there is no response (checked by the error.status error there)
    // it will return a HTTP response
    .catch((error) => {
      if (error.status != null) return error;
      return { body: String(error), status: 500 };
    })

    // TODO: Destructuring?
    .then(({ body, status = 200, type = "text/plain" }) => {
      // Write header of HTTP response, defaulting status to 200 and to text/plain
      response.writeHead(status, { "Content-Type": type });

      // Feed data from body into response if if not null
      if (body && body.pipe) body.pipe(response);
      // If not, close the stream
      else response.end(body);
    });
}).listen(8000);

const { parse } = require("url");
const { resolve, sep } = require("path");

const baseDirectory = process.cwd();
function urlPath(url) {
  let { pathname } = parse(url);
  let path = resolve(decodeURIComponent(pathname).slice(1));
  if (path != baseDirectory && !path.startsWith(baseDirectory + sep)) {
    throw { status: 403, body: "Forbidden" };
  }
  return path;
}

async function notAllowed(request) {
  return {
    status: 405,
    body: `Method ${request.method} is not allowed`,
  };
}
