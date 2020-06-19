const User = require('../models/User')
const Post = require('../models/Post')
const Follow = require('../models/Follow')
const jwt = require('jsonwebtoken')

exports.apiGetPostsByUsername = async function(req, res) {
    try {
        let authorDoc = await User.findByUsername(req.params.username)
        let posts = await Post.findByAuthorId(authorDoc._id) // This will return an array of posts
        res.json(posts)
    }
    catch {
        res.json("Sorry, invalid user requested.")
    }
}
exports.doesUsernameExist = function(req, res) {
    User.findByUsername(req.body.username).then(function() {
        res.json(true)
    }).catch(function () {
        res.json(false)
    })
}
exports.doesEmailExist = async function(req, res) {
    let emailBool = await User.doesEmailExist(req.body.email)
    res.json(emailBool)
}


exports.sharedProfileData = async function(req, res, next) {
    let isVisitorsProfile = false
    let isFollowing = false
    if(req.session.user) {
        isVisitorsProfile = req.profileUser._id.equals(req.session.user._id)
       isFollowing = await Follow.isVisitorFollowing(req.profileUser._id, req.visitorId)
    }
    req.isFollowing = isFollowing
    req.isVisitorsProfile = isVisitorsProfile
    // Retrieve post, follower and follwoing counts
    let postCountPromise =  Post.countPostsByAuthor(req.profileUser._id)
    let followerCountPromise =  Follow.countFollowersById(req.profileUser._id)
    let followingCountPromise =  Follow.countFollowingById(req.profileUser._id)
    //destructure
    let [postCount, followerCount, followingCount] = await Promise.all([postCountPromise, followerCountPromise, followingCountPromise])
    // add on to the request object
    req.postCount = postCount 
    req.followerCount = followerCount 
    req.followingCount = followingCount

    next()
}

exports.register = function(req, res) {
    let user = new User(req.body)
    user.register().then(() => {
        req.session.user = {username: user.data.username, avatar: user.data.avatar, _id: user.data._id} // Here we are setting session data 
        req.session.save(function() {
            res.redirect('/')
        })
    }).catch((regErrors) => {
        regErrors.forEach(function (error) {
            req.flash('regErrors', error)
        })
        req.session.save(function () {
            res.redirect('/')
        })
    })
    
}
exports.home = async function(req, res) {
    if(req.session.user) {
        // Fetch feed of posts for current user 
        let posts = await Post.getFeed(req.session.user._id)
        res.render('home-dashboard', {posts: posts})
    } else {
        res.render('home-guest', {regErrors: req.flash('regErrors')}) // With flash, as soon as you access 'errors', they are deleted
    }
}
exports.mustBeLoggedIn = function(req, res, next) {
    if(req.session.user) { // there is only going to be such an object if the user has logged in.
        next()
    } else {
        req.flash('errors', 'You must be logged in to perform that action.')
        req.session.save(function() {
            res.redirect('/')
        })
    }
}
exports.apiMustBeLoggedIn = function(req, res, next) {
    try {
        req.apiUser = jwt.verify(req.body.token, process.env.JWTSECRET)
        next()

    }
    catch {
        res.json("Sorry you must provide a valid token.")
    }
}
exports.login = function(req, res) {
    let user = new User(req.body)
    user.login().then(function(result) {
        req.session.user = {avatar: user.avatar, username: user.data.username, _id: user.data._id}
        req.session.save(function() {
            res.redirect('/')
        })
    }).catch(function(err) {
        req.flash('errors', err) // This flash package will help us add and remove data from our session
        req.session.save(function () {
            res.redirect('/')
        })
        
    }) 
}
//decoupled from the web browser environment
exports.apiLogin = function(req, res) {
    let user = new User(req.body)
    user.login().then(function(result) {
        res.json(jwt.sign({_id: user.data._id}, process.env.JWTSECRET, {expiresIn: '30h'}))
    }).catch(function(err) {
        res.json("sorry your values are not correct")
    }) 
}
exports.logout = function(req, res) {
    req.session.destroy(function () {
        res.redirect('/')
    }); 
    
}
exports.ifUserExists = function(req, res, next) {
    User.findByUsername(req.params.username).then(function(userDocument) {
        req.profileUser = userDocument
        next()
    }).catch(function() {
        res.render('404')
    })
}
exports.profilePostsScreen = function(req, res){ // we need to pass it the lists of posts for the author
    // ask our post model for posts by a certain author id
    Post.findByAuthorId(req.profileUser._id).then(function(posts) {
        
        res.render('profile', {
            title: `Profile for ${req.profileUser.username}`,
            currentPage: "posts",
            posts: posts,
            profileUsername: req.profileUser.username,
            profileAvatar: req.profileUser.avatar,
            isFollowing: req.isFollowing,
            isVisitorsProfile: req.isVisitorsProfile,
            counts: {postCount: req.postCount, followerCount: req.followerCount, followingCount: req.followingCount}
        })
// the value will be an array of posts
    }).catch(function(){
// a technical issue therefore 404
        res.render('404')
    })
    
}
exports.profileFollowersScreen = async function(req, res) {
    try {
        let followers = await Follow.getFollowersById(req.profileUser._id)
        res.render('profile-followers', {
            currentPage: "followers",
            followers: followers,
            profileUsername: req.profileUser.username,
            profileAvatar: req.profileUser.avatar,
            isFollowing: req.isFollowing,
            isVisitorsProfile: req.isVisitorsProfile,
            counts: {postCount: req.postCount, followerCount: req.followerCount, followingCount: req.followingCount}

    })
    } catch {
        res.render('404')
    }
}
exports.profileFollowingScreen = async function(req, res) {
    try {
        let following = await Follow.getFollowingById(req.profileUser._id)
        res.render('profile-following', {
            currentPage: "following",
            following: following,
            profileUsername: req.profileUser.username,
            profileAvatar: req.profileUser.avatar,
            isFollowing: req.isFollowing,
            isVisitorsProfile: req.isVisitorsProfile,
            counts: {postCount: req.postCount, followerCount: req.followerCount, followingCount: req.followingCount}

    })
    } catch {
        res.render('404')
    }
}