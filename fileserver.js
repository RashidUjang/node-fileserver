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

async function notAllowed(request) {
  return {
    status: 405,
    body: `Method ${request.method} is not allowed`,
  };
}

const { parse } = require("url");
const { resolve, sep } = require("path");

// Returns the current working directory of the process
const baseDirectory = process.cwd();

function urlPath(url) {
  // Destructuring syntax, assigns the result of parse.pathname to an object called pathname
  // Parses the url to each component, then only gets the specific pathname
  // TODO: Change to WHATWG
  let { pathname } = parse(url);

  // URL returned from parse is percent-encoded (e.g. ? is %3F) and it returns the / in front, and thus must be sliced.
  // The resolve function returns the absolute path requested, meaning the path that includes the baseDirectory plus the url's path
  let path = resolve(decodeURIComponent(pathname).slice(1));

  // Checking if the resolved path is the base directory or an extension of it. If not, throw an error
  // sep provides the platform-specific path segment separator
  if (path != baseDirectory && !path.startsWith(baseDirectory + sep)) {
    throw { status: 403, body: "Forbidden" };
  }

  // If yes, return the path of the file
  return path;
}

const { createReadStream } = require("fs");
// Promises interface version of fs.stat() and fs.readdir(), to be able to use in async functions
const { stat, readdir } = require("fs").promises;
// MIME-type handler library, which can automatically get the MIME type for any particular file type
const mime = require("mime");

// If HTTP method type is GET, then retrieve the file
methods.GET = async function (request) {
  let path = urlPath(request.url);
  let stats;

  // Get's some metadata on the file that is located at path. If found, assign to stats. If not found, throw an error.
  try {
    // TODO: Replace stat() call here with just opening the file. Not recommended according to the Node.js documentation
    // https://nodejs.org/api/fs.html#fs_fs_stat_path_options_callback
    stats = await stat(path);
  } catch (error) {
    // ENOENT is an error code when file is not found
    if (error.code != "ENOENT") throw error;
    else return { status: 404, body: "File not found" };
  }

  // Checks if the path of the item that is a directory. If yes, get all files in the directory and just display the names.
  // If it's not directory and is a straight file
  if (stats.isDirectory()) {
    // Readdir returns an Array of string of all names in the directory
    return { body: (await readdir(path)).join("\n") };
  } else {
    // If it's not a directory, the request body will be the streamed contents of the file at path
    return { body: createReadStream(path), type: mime.getType(path) };
  }
};

const { rmdir, unlink } = require("fs").promises;

// If HTTP method type is DELETE, then the file will be removed
methods.DELETE = async function (request) {
  let path = urlPath(request.url);
  let stats;

  // Check if there is a file at path
  try {
    stats = await stat(path);
  } catch (error) {
    if (error.code != "ENOENT") throw error;
    // 204 error code means the response doesn't contain any data and the application is successful.
    // The HTTP standard encourages us to make requests idempotent, which means that making the same request multiple times produces
    // the same result as making it once. Hence, the request returns successful if the file is not there, instead of an error.
    // In a way, the objective of the request has been fulfilled
    else return { status: 204 };
  }

  // Use rmdir() if specified path is a directory. If not, use unlink.
  if (stats.isDirectory()) await rmdir(path);
  else await unlink(path);

  // After a successful deletion, what is returned is a successful
  return { status: 204 };
};

const { createWriteStream } = require("fs");

// Pipes the data from first arg to second arg, returning a Promise, with some error handling
function pipeStream(from, to) {
  return new Promise((resolve, reject) => {
    from.on("error", reject);
    to.on("error", reject);
    to.on("finish", resolve);
    from.pipe(to);
  });
}

// If HTTP method is PUT, to transfer the file from the host to the server
methods.PUT = async function (request) {
  let path = urlPath(request.url);
  
  // Transfers the file from first arg, into second arg. This is possible as request is a stream
  await pipeStream(request, createWriteStream(path));
  return { status: 204 };
};
