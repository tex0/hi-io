/*
 * File IO operations
 * */
var mFs = require('fs');
var mBuffer = require('buffer');
var mPath = require('path');
var lHelper = require('./helper');

function OpenFile(fileName, openOption, context) {
    var lOpen = function (context, fd, stats) {
        this.fd_ = fd;
        this.stats_ = stats;
        this.opened_ = this.fd_ && this.stats_;
		context.task.Next(null, this);
    }
    
    var lStats = function (context, stats) {
        context.task.Continue(lOpen.bind(this));
        mFs.open(fileName, openOption, function (err, fd) {
            context.task.Next(err, fd, stats);
        });
    }
    
    var lBegin = function (context) {
		var ln = context.task.Continue(lStats.bind(this))
		mFs.stat(fileName, function (err, stats) {
			if (openOption == File.OpenOptions.ReadWrite) {
				context.task.Next(null, stats);
			}
			else
				context.task.Next(err, stats);
        });
    }
    
    context.task.Continue(lBegin.bind(this));
    context.task.Next(null);
}

function ReadFile(fd, stats, count, startPosition, context) {
	if (this.opened_ === false)
		context.task.Next(new Error("File '" + this.fileFullName_ + "' is not opened."));

	var lReaded = function (context, fd, readedBlock, stats, offset, currentPos, resultBuff) {
		
		if (stats.size <= currentPos) {
			this.currentPosition_ = count + startPosition;
			context.task.Next(null, this, resultBuff, this.currentPosition_);
            return;
        }
        
		var lLength = 0;
		if (this.chunkSize_ <= 0)
			lLength = count;
        else if (stats.size - this.currentPosition_ >= this.chunkSize_)
            lLength = this.chunkSize_;
		else lLength = stats.size - this.currentPosition_;
		
		if (lLength >= offset) {
			this.currentPosition_ = count + startPosition;
			context.task.Next(null, fd, resultBuff, this.currentPosition_);
			return;
		}

		context.task.Continue(lReaded.bind(this));
        mFs.read(fd, resultBuff, offset, lLength, this.currentPosition_, function (err, bytesRead, buff) {
			context.task.Next(err, fd, buff, stats, this.currentPosition_ + bytesRead, this.currentPosition_ + bytesRead, resultBuff);
        });
    }
    
    var lBegin = function (context, fd, stats) {
		var buffer = new mBuffer.Buffer(count);
		buffer.fill(0x00, 0, buffer.length);
		context.task.Continue(lReaded.bind(this));
		mFs.read(fd, buffer, 0x00, count, startPosition, function (err, bytesRead, buff) {
			context.task.Next(err, fd, buff, stats, bytesRead, bytesRead, buffer);
		});
    }
    context.task.Continue(lBegin.bind(this));
	context.task.Next(null, fd, stats);
}

function WriteFile(fd, buffer, buffOffset, length, startWriteFilePosition, currentContext) {
	if (this.opened_ === false)
		currentContext.task.Next(new Error("File '" + this.fileFullName_ + "' is not opened."));

	var lStat = function (context, stat){
		this.stats_ = stat;
		context.task.Next(null, this);
	}
	var lWriting = function (context, writtenCount) { 
		context.task.Continue(lStat.bind(this));
		File.Stat(this.fileFullName_, true, context);
	}
	currentContext.task.Continue(lWriting.bind(this));
	mFs.write(fd, buffer, buffOffset, length, startWriteFilePosition, function (err, written, str) { 
		currentContext.task.Next(err, written);
	});
}

function CloseFile(fd, context) {
	var lSelf = this;
	mFs.close(fd, function (err) {
		lSelf.opened_ = false;
		if (context)
			context.task.Next(err, lSelf);
    });
}

function File(fullName) {
    this.fd_ = undefined;
    this.stats_ = undefined;
    this.fileFullName_ = fullName;
    this.currentPosition_ = 0;
	this.opened_ = false;
	this.chunkSize_ = -1;
	this.chunkMeasure_ = File.ChunkMeasure.b;
}
File.prototype = {
    get FullName() {
        return this.fileFullName_;
    },
    get Opened() {
        return this.opened_;
    },
    get DirectoryPath() {
		return mPath.dirname(this.fileFullName_);
    },
    get Name() { 
		return mPath.basename(this.fileFullName_);
    },
    get Stats() {
        return this.stats_;
	},
	get ChunkSize(){
		return this.chunkSize_;
	},
	set ChunkSize(val){
		this.chunkSize_ = val;
	},
	get ChunkMeasure(){ 
		return this.chunkMeasure_;
	},
	set ChunkMeasure(val){
		this.chunkMeasure_ = val;
	},
	get CurrentPosition(){
		return this.currentPosition_;
	}
}
File.prototype.Open = function (context, openOption) {
	lHelper.checkTaskContext(context);
	if (openOption === undefined || openOption == null)
		openOption = File.OpenOptions.ReadWriteF;
    OpenFile.call(this, this.fileFullName_, openOption, context);
}
File.prototype.Read = function (count, startPosition, context) {
	lHelper.checkTaskContext(context);
    ReadFile.call(this, this.fd_, this.stats_, count, startPosition, context);
}
File.prototype.Write = function (buffer, buffOffset, length, startWriteFilePosition, context) {
	lHelper.checkTaskContext(context);
    WriteFile.call(this, this.fd_, buffer, buffOffset, length, startWriteFilePosition, context);
}
File.prototype.Close = function (context) {
	lHelper.checkTaskContext(context);
    CloseFile.call(this, this.fd_, context)
}

File.Create = function (fullName, force, context){
	lHelper.checkTaskContext(context);
	var lFile = new File(fullName);
		
	var lOpen = function (context){
		context.task.Continue(function (context, file) {
			file.Close(context);
		});
		lFile.Open(context, File.OpenOptions.ReadWrite);
	}
	
	var lExist = function (context, err){
		if (!err) {
			context.task.Continue(lOpen);
			File.Delete(fullName, context);
		}
		else
			lOpen(context);
	}
		
	if (force === true) {
		context.task.Continue(lExist);
		File.Stat(fullName, false, context);
	}
	else {
		lOpen(context);
	}
}

File.Stat = function (path, thrownError, context){
	lHelper.checkTaskContext(context);
	var lStat = function (context, thrown) {
		mFs.stat(path, function (err, stat) {
			context.Stat = stat;
			if (thrown === true)
				context.task.Next(err, stat);
			else context.task.Next(null, err, stat);
		});
	}
	//context.task.ThrouthContext = true;
	context.task.Continue(lStat, thrownError);
	context.task.Next();
}

File.Exists = function (path, context){
	lHelper.checkTaskContext(context);
	var lStat = function (context, err) { 
		if (err && err.code === 'ENOENT')
			context.task.Next(null, err);
		else context.task.Next(err);
	}

	context.task.Continue(lStat);
	File.Stat(path, false, context);
}

File.Copy = function (from, to, forced, context) {//!!! доделать
	lHelper.checkTaskContext(context);
	var lGoCopy = function (context){
		mFs.link(from, to, function (err) {
			if (forced === true)
				context.task.Next(null, err);
			else context.task.Next(err);
        });
	}

	context.task.Continue(lGoCopy);
	context.task.Next();
}
File.Delete = function (path, context) {    
	lHelper.checkTaskContext(context);
    var lUnlink = function (context, stat) {
        if (!stat.isFile()) {
			context.task.Next(new Error('Deleting target is not a file!'));
            return;
        }
		mFs.unlink(path, function (err) {
			context.task.Next(err);
        });
    }
	var lGoStat = function (context) {
		mFs.stat(path, function (err, stats) {
			context.task.Continue(lUnlink);
			context.task.Next(err, stats);
		});
	}
	context.task.Continue(lGoStat);
	context.task.Next();
}

File.Move = function (from, to, forced, context){//!!!
	lHelper.checkTaskContext(context);
	var lDelete = function (context){
		File.Delete(from, context);
	}

	var lCopy = function (context){
		context.task.Continue(lDelete);
		File.Copy(from, to, forced, context);
	}
	context.task.Continue(lCopy);
	context.task.Next();
}

File.ReadAll = function (path, context) {
	lHelper.checkTaskContext(context);
	var lResult = function (context, data) {
		context.task.Next(null, data);
	}
	
	var lReadFile = function (context) {
		context.task.Continue(lResult);
		mFs.readFile(path, function (err, data) {
			context.task.Next(err, data);
		});
	}
	
	context.task.Continue(lReadFile);
	context.task.Next();
}
File.Append = function (path, buffer, context) {
	lHelper.checkTaskContext(context);
    var lAppended = function (context) {
        context.task.Next();
    }
    
    var lGoAppend = function (context){
        context.task.Continue(lAppended);
        mFs.appendFile(path, buffer, function (err) { 
            context.task.Next(err);
        });
    }
    context.task.Continue(lGoAppend);
    context.task.Next(err);

}
File.AppendString = function (path, str, encoding, context) {
	lHelper.checkTaskContext(context);
    var lBuffer = new mBuffer.Buffer(str, encoding);
    File.Append(path, lBuffer, context);
}

/** @description Options for open file
 */
function OpenOptions() { }
OpenOptions.prototype = {
	/* From documentation
		'r' - Open file for reading. An exception occurs if the file does not exist.
		'r+' - Open file for reading and writing. An exception occurs if the file does not exist.
		'rs' - Open file for reading in synchronous mode. Instructs the operating system to bypass the local file system cache.
		This is primarily useful for opening files on NFS mounts as it allows you to skip the potentially stale local cache. It has a very real impact on I/O performance so don't use this flag unless you need it.
		Note that this doesn't turn fs.open() into a synchronous blocking call. If that's what you want then you should be using fs.openSync()
		'rs+' - Open file for reading and writing, telling the OS to open it synchronously. See notes for 'rs' about using this with caution.
		'w' - Open file for writing. The file is created (if it does not exist) or truncated (if it exists).
		'wx' - Like 'w' but fails if path exists.
		'w+' - Open file for reading and writing. The file is created (if it does not exist) or truncated (if it exists).
		'wx+' - Like 'w+' but fails if path exists.
		'a' - Open file for appending. The file is created if it does not exist.
		'ax' - Like 'a' but fails if path exists.
		'a+' - Open file for reading and appending. The file is created if it does not exist.
		'ax+' - Like 'a+' but fails if path exists.
	*/
	get ReadOnly(){
		return "r";
	},
	get WriteOnly(){
		return "w";
	},
    get ReadWriteF() {
        return "r+";
    },
    get ReadWrite() {
        return "w+";
	},
	get Append() { 
		return "a";
	},
	get ReadAppend() { 
		return "a+";
	}
}

/** @description Measure of chunk
 */
function ChunkMeasure(){ }
ChunkMeasure.prototype = {
	get b() { return 1; },
	get Kb() { return 1000; },
	get Mb() { return 1000000 },
	get Gb() { return 1000000000}
}

File.OpenOptions = new OpenOptions();
File.ChunkMeasure = new ChunkMeasure();

module.exports = function () {
	this.File = File;
}
