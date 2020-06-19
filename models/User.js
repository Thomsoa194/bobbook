const validator = require('validator')
const usersCollection = require('../db').db().collection('users')
const bcrypt = require('bcryptjs')
const md5 = require('md5')
let User = function(data, getAvatar) {
    this.data = data
    this.errors = []
    if(getAvatar == undefined) {getAvatar = false}
    if(getAvatar == true) {this.getAvatar()}  
}

User.prototype.cleanUp = function() {
    if(typeof(this.data.username) != 'string') {this.data.username = ''}
    if(typeof(this.data.email) != 'string') {this.data.email = ''}
    if(typeof(this.data.password) != 'string') {this.data.password = ''}
    // Get rid of bogus properties
    this.data = {
        username: this.data.username.trim().toLowerCase(),
        email: this.data.email.trim().toLowerCase(),
        password: this.data.password
    }
}
User.prototype.validate = function() {
    return new Promise(async (resolve, reject) => {
        if(this.data.username == '') {this.errors.push('You must provide a Username.')}
        if(this.data.username != '' && !validator.isAlphanumeric(this.data.username)) {this.errors.push('Username can only contain letters and numbers')}
        if(!validator.isEmail(this.data.email)) {this.errors.push('You must provide a valid email address.')}
        if(this.data.password == '') {this.errors.push('You must provide a password.')}
        if(this.data.password.length > 0 && this.data.password.length < 12) {this.errors.push('Password must be at least 12 characters')}
        if(this.data.password.length > 30) {this.errors.push('Password cannot exceed 30 characters.')}
        if(this.data.username.length > 0 && this.data.username.length < 3) {this.errors.push('Username must be at least 3 characters')}
        if(this.data.username.length > 30) {this.errors.push('Username cannot exceed 30 characters.')}
    
        // This is where we see if the username and email are taken but only if they are valid. 
        if(this.data.username > 2 && this.data.username < 31 && validator.isAlphanumeric(this.data.username)) {
            let usernameExists =  await usersCollection.findOne({username: this.data.username}) // the findOne method will evaluate to null if there is no matching username
            if(usernameExists) {this.errors.push('that username is already taken.')} // thus this would then evaluate to false
        }

         // Only if the email is valid then we check to see if it is already taken 
        if(validator.isEmail(this.data.email)) {
            let emailExists =  await usersCollection.findOne({email: this.data.email}) // the findOne method will evaluate to null if there is no matching username
            if (emailExists) {this.errors.push('That email is already taken.')} // thus this would then evaluate to false
        } 
        resolve()
})
}    


User.prototype.login = function() {
    return new Promise((resolve, reject) => {
        this.cleanUp()// arrow functions do not manipulate or change the this keyword. Instead it will point to the user object not the global object
    usersCollection.findOne({username: this.data.username}).then((attemptedUser) => {
        if(attemptedUser && bcrypt.compareSync(this.data.password , attemptedUser.password)){
            this.data = attemptedUser
            this.getAvatar()
            resolve('congrats')
        } else {
            reject('Invalid username or password')
        }
    }).catch(function() {
        reject('Please try again later.')
    })
   })
}

User.prototype.register = function() {
    return new Promise(async(resolve, reject) => {
        // Here we enforce our business logic to validate the user
        this.cleanUp()
        await this.validate()  
        // Step One: Validate our user 
        // Step Two: Only if there are no validation errors, store our data in a db
        if(!this.errors.length) { // If this code runs, then the register was successful, therefore we need to call resolve
            // Hash user password
            let salt = bcrypt.genSaltSync(10)
            this.data.password = bcrypt.hashSync(this.data.password, salt)
            await usersCollection.insertOne(this.data) // We use await because mongodb returns a promise
            this.getAvatar()
            resolve()
    
        } else {
            reject(this.errors)
        }
    }) 
}
User.prototype.getAvatar = function() {
    this.avatar = `https://gravatar.com/avatar/${md5(this.data.email)}?s=128`
}
User.findByUsername = function(username) {
    return new Promise(function(resolve, reject){
        if(typeof(username) != 'string'){
            reject()
            return
        }
        usersCollection.findOne({username: username}).then(function(userDoc){
           if(userDoc) {
               userDoc = new User(userDoc, true)
               userDoc = {
                   _id: userDoc.data._id,
                   username: userDoc.data.username,
                   avatar: userDoc.avatar
               }
               resolve(userDoc)
           } else {
               reject()
           }
        }).catch(function(){
            reject()
        })
    })
}
User.doesEmailExist = function(email) {
    return new Promise(async function(resolve, reject) {
        if (typeof(email) != 'string') {
            resolve(false)
            return
        }
        let user = await usersCollection.findOne({email: email})
        if (user) {
            resolve(true)
        } else {
            resolve(false)
        }
    })
}

module.exports = User