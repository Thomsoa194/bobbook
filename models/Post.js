const ObjectID = require('mongodb').ObjectID
const User = require('./User')
const santizeHtml = require('sanitize-html')
const postsCollection = require('../db').db().collection('posts')
const followsCollection = require('../db').db().collection('follows')
// This is our post blue print. It needs to have a method named create and return a promise.

let Post = function(data, userid, requestedPostId) {
    this.data = data
    this.errors = [],
    this.userid = userid, 
    this.requestedPostId = requestedPostId

}
Post.prototype.create = function() { // Here we store a document in the database
    return new Promise((resolve, reject) => {
        this.cleanUp()
        this.validate()
        if(!this.errors.length) { // If that errors array is empty, this is where we will want to store that new document
        // save post into database
        postsCollection.insertOne(this.data).then((info) => {
            resolve(info.ops[0]._id)
        }).catch(() => {
            this.errors.push('Please try again later')
            reject(this.errors)
        }) // Remember mongodb methods return promises
        

        } else {
            reject(this.errors)
        }
    })
}
Post.prototype.update = function() {
    return new Promise(async (resolve, reject) => {
        try {
           let post = await Post.findSingleById(this.requestedPostId, this.userid)
            if(post.isVisitorOwner) {
                // Actually update the db
                let status = await this.actuallyUpdate()
                resolve(status)
            } else {
                // They are up to no good, not the author of the post
                reject()
            }
        } 
        catch {
        reject()
        }
    }) 
}
Post.prototype.actuallyUpdate = function() {
    return new Promise(async (resolve, reject) => {
        this.cleanUp()
        this.validate()
        if(!this.errors.length) {
            await postsCollection.findOneAndUpdate({_id: new ObjectID(this.requestedPostId)}, {$set: {title: this.data.title, body: this.data.body}})
            resolve("success")
        } else {
            resolve("failure")
        }
    })
}
Post.prototype.cleanUp = function() {
    // They need to firstly be strings
    if (typeof(this.data.title) != 'string') {this.data.title = ''}
    if (typeof(this.data.body) != 'string') {this.data.body = ''}
    // Get rid of any bogus properties
    this.data = {
        title: santizeHtml(this.data.title.trim(), {allowedTags: [], allowedAttributes: {}}),
        body: santizeHtml(this.data.body.trim(), {allowedTags: [], allowedAttributes: {}}),
        createdDate: new Date(),
        author: ObjectID(this.userid)                          // This will return a date object representing the current time this code executes
    }
}
Post.prototype.validate = function() {
   // We just need to make sure these fields aren't blank
   if(this.data.title == '') {this.errors.push('You must provide a title')}
   if(this.data.body == '') {this.errors.push('You must provide post content ')}
}
Post.reusablePostQuery = function(uniqueOperations, visitorId) {
    return new Promise(async function(resolve, reject) { 
        let aggOperations = uniqueOperations.concat([
    
            {$lookup: {from: 'users', localField: 'author', foreignField: '_id', as: 'authorDocument'}},// The doc we want to look up should be from the users collection
            {$project: {
                title: 1,
                body: 1,
                createdDate: 1,
                authorId: '$author',
                author: {$arrayElemAt: ['$authorDocument', 0]}
            }} 
        ])
        // Here we have an id value that is safe to look up in our database
        let posts = await postsCollection.aggregate(aggOperations).toArray()
        // Clean up author property in each post object 
        posts = posts.map(function(post){
            post.isVisitorOwner = post.authorId.equals(visitorId)
            post.authorId = undefined
            post.author = {
                username: post.author.username,
                avatar: new User(post.author, true).avatar,
                
            }
            return post
        })
            resolve(posts)
    }) 
}







// Here we are not taking an object oriented approach.
Post.findSingleById = function(id, visitorId) {
    return new Promise(async function(resolve, reject) {
        // see if it makes sense and isn't malicious 
        if(typeof(id) != 'string' || !ObjectID.isValid(id)) {
            reject()
            return
        } 
        // Here we have an id value that is safe to look up in our database
        let posts = await Post.reusablePostQuery([
            {$match: {_id: new ObjectID(id)}}
        ], visitorId)
        if(posts.length){ // This will evaluate to true if the array has moer than 0 items in it
            console.log(posts[0])
            resolve(posts[0])
        } else {
            reject()
        }
    }) 
}



Post.findByAuthorId = function(authorId) {
    return Post.reusablePostQuery([
        {$match: {author: authorId}},
        {$sort: {createdDate: -1}}
    ])
}
Post.delete = function(postIdToDelete, currentUserId) {
    return new Promise(async(resolve, reject) => {
        try {
            let post = await Post.findSingleById(postIdToDelete, currentUserId)
            if(post.isVisitorOwner) {
                await postsCollection.deleteOne({_id: new ObjectID(postIdToDelete)})
                resolve()
            } else {
                reject()
            }
        }
        catch {
                reject()
        }
    })
}
Post.search = function(searchTerm) {
    return new Promise(async(resolve, reject) => {
        if(typeof(searchTerm) == 'string') {
            let posts = await Post.reusablePostQuery([
                {$match: {$text: {$search: searchTerm}}},
                {$sort: {score: {$meta: "textScore"}}}
            ])
            resolve(posts)
        } else {}
    })

}
Post.countPostsByAuthor = function(id) {
    return new Promise(async(resolve, reject) => {
        let postCount = await postsCollection.countDocuments({author: id})
        resolve(postCount)
    })
}
Post.getFeed = async function(id) {
    // Create an array of the user ids that the current user follows
    let followedUsers = await followsCollection.find({authorId: new ObjectID(id)}).toArray()
    followedUsers = followedUsers.map(function(followDoc) {
        return followDoc.followedId
    })
    
    // Look for posts where the author is in the above array of followed users
    return Post.reusablePostQuery([
        {$match: {author: {$in: followedUsers}}},
        {$sort: {createdDate: -1}}
    ])
}


module.exports = Post