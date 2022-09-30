const pkg = require('../../../../package.json');

const { homepage, repository } = pkg;

module.exports = {
    homepage,
    github: repository.url
}